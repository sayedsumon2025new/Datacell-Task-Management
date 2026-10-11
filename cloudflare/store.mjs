import spec from './schema-spec.json' with { type: 'json' };

export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
const quote = name => '"' + name + '"';
export const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export function entryIdentity(row) {
  const level = norm(row.level).replace(/^level\s*[-:]?\s*0*(\d+)$/, 'level-$1');
  const line = norm(row.line_no).replace(/^(?:(?:ln|line)\s*[-:]?\s*)?(\d+)$/, (_, n) => String(Number(n)));
  return JSON.stringify([row.work_date || '0001-01-01', norm(row.department), norm(row.section), level, line]);
}
export class Store {
  constructor(db) { this.db = db; }
  schema(table) { if (!Object.hasOwn(spec, table)) fail('Unsupported table'); return spec[table]; }
  column(table, name) { if (!Object.hasOwn(this.schema(table).columns, name)) fail('Unsupported column: ' + name); return quote(name); }
  encode(table, name, value) {
    const c = this.schema(table).columns[name]; if (!c) fail('Unsupported column: ' + name);
    if (value == null) { if (!c.nullable && !c.default) fail(name + ' is required'); return null; }
    if (c.type === 'boolean') { if (value !== true && value !== false && value !== 0 && value !== 1) fail('Invalid boolean: ' + name); return value ? 1 : 0; }
    if (c.type === 'jsonb') return JSON.stringify(value);
    if (/integer|bigint|smallint/.test(c.type)) { const n = Number(value); if (!Number.isSafeInteger(n)) fail('Invalid integer: ' + name); if (['working_hours_defaults','working_hours_daily'].includes(table) && name==='minutes' && (n<0||n>1440)) fail('Minutes must be between 0 and 1440'); return n; }
    if (/numeric|double|real/.test(c.type)) { const n = Number(value); if (!Number.isFinite(n)) fail('Invalid number: ' + name); return n; }
    if (typeof value !== 'string') fail('Invalid text: ' + name);
    return value;
  }
  decode(table, row, secrets = false) {
    if (!row) return row;
    const out = {};
    for (const [name, value] of Object.entries(row)) {
      if (name.startsWith('_')) continue;
      const type = this.schema(table).columns[name]?.type;
      out[name] = type === 'jsonb' && value != null ? JSON.parse(value) : type === 'boolean' && value != null ? !!value : value;
    }
    if (table === 'users' && !secrets && 'password' in out) out.password = '';
    return out;
  }
  filter(table, field, input, values) {
    const column = this.column(table, field);
    const push = v => { values.push(this.encode(table, field, v)); return '?'; };
    let value = String(input), not = false;
    if (value.startsWith('not.')) { not = true; value = value.slice(4); }
    const dot = value.indexOf('.'); if (dot < 0) fail('Unsupported filter');
    const op = value.slice(0, dot), v = value.slice(dot + 1);
    let expression;
    const parse = text => this.schema(table).columns[field].type === 'boolean' ? text === 'true' ? true : text === 'false' ? false : fail('Invalid boolean') : text;
    if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(op)) expression = column + ({ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]) + push(parse(v));
    else if (op === 'is' && v === 'null') expression = column + ' IS NULL';
    else if (op === 'is' && ['true', 'false'].includes(v)) expression = column + '=' + push(parse(v));
    else if (op === 'in' && /^\([^()]*\)$/.test(v)) {
      const members = v.slice(1, -1).split(',').map(parse);
      if (members.length > 1000) fail('Too many filter values');
      expression = column + ' IN (' + members.map(push).join(',') + ')';
    } else if (['like', 'ilike'].includes(op)) { values.push(v.replace(/\*/g, '%')); expression = (op === 'ilike' ? 'lower(' + column + ')' : column) + ' LIKE ' + (op === 'ilike' ? 'lower(?)' : '?'); }
    else fail('Unsupported filter operator');
    return not ? 'NOT (' + expression + ')' : expression;
  }
  query(table, query = '', version) {
    this.schema(table); const q = query instanceof URLSearchParams ? query : new URLSearchParams(query), values = [], clauses = [];
    if (version) { clauses.push('"_publication_version"=?'); values.push(version); }
    for (const [field, value] of q) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(field)) continue;
      // Entry scope is applied structurally by the server, never parsed from arbitrary SQL.
      if (field === 'or') fail('Unsupported logical filter');
      clauses.push(this.filter(table, field, value, values));
    }
    const fields = q.get('select') || '*';
    const projection = fields === '*' ? '*' : fields.split(',').map(x => this.column(table, x)).join(',');
    const orders = (q.get('order') || '').split(',').filter(Boolean).map(value => {
      const [field, direction = 'asc', extra] = value.split('.');
      if (!['asc', 'desc'].includes(direction) || extra) fail('Unsupported order');
      return this.column(table, field) + ' ' + direction;
    });
    const limit = Number(q.get('limit') || 1000), offset = Number(q.get('offset') || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000 || !Number.isSafeInteger(offset) || offset < 0) fail('Invalid pagination');
    return { q, values, projection, where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', suffix: (orders.length ? ' ORDER BY ' + orders.join(',') : '') + ' LIMIT ' + limit + ' OFFSET ' + offset };
  }
  async read(table, query = '', version, secrets = false, scope) {
    const compiled = this.query(table, query, version);
    if (scope && scope.mode !== 'all') {
      const rules = scope.rules || []; let condition = '0';
      if (rules.length) condition = '(' + rules.map(rule => '(' + ['department', 'section', 'level'].filter(k => rule[k] !== '*').map(k => {
        compiled.values.push(rule[k]); return this.column(table, k) + '=?';
      }).join(' AND ') + ')').join(' OR ') + ')';
      compiled.where += (compiled.where ? ' AND ' : ' WHERE ') + condition;
    }
    const result = await this.db.prepare('SELECT ' + compiled.projection + ' FROM ' + quote(version ? 'published_' + table : table) + compiled.where + compiled.suffix).bind(...compiled.values).all();
    return result.results.map(row => this.decode(table, row, secrets));
  }
  insertStatement(table, row, upsert = false, conflict) {
    const schema = this.schema(table), data = { ...row };
    if (table === 'work_hour_user_interface') data._identity = entryIdentity(row);
    if (schema.primary.length === 1 && schema.columns[schema.primary[0]].type === 'uuid' && !data[schema.primary[0]]) data[schema.primary[0]] = crypto.randomUUID();
    const names = Object.keys(data), values = names.map(k => k === '_identity' ? data[k] : this.encode(table, k, data[k]));
    if (!names.length) fail('Empty row');
    let sql = 'INSERT INTO ' + quote(table) + ' (' + names.map(quote).join(',') + ') VALUES (' + names.map(() => '?').join(',') + ')';
    if (upsert) {
      const target = conflict ? conflict.split(',') : schema.unique[0] || schema.primary;
      if (![schema.primary, ...schema.unique].some(keys => keys.join(',') === target.join(','))) fail('Invalid conflict key');
      const updates = names.filter(k => !target.includes(k) && !schema.primary.includes(k));
      sql += ' ON CONFLICT (' + target.map(quote).join(',') + ') DO ' + (updates.length ? 'UPDATE SET ' + updates.map(k => quote(k) + '=excluded.' + quote(k)).join(',') : 'NOTHING');
    }
    return this.db.prepare(sql + ' RETURNING *').bind(...values);
  }
  updateStatement(table, row, query, extraGuard = '') {
    const compiled = this.query(table, query), names = Object.keys(row);
    if (!compiled.where || !names.length) fail('A write filter and fields are required');
    const values = names.map(k => this.encode(table, k, row[k]));
    return this.db.prepare('UPDATE ' + quote(table) + ' SET ' + names.map(k => this.column(table, k) + '=?').join(',') + compiled.where + extraGuard + ' RETURNING *').bind(...values, ...compiled.values);
  }
  guard(sql, values = []) { return this.db.prepare('INSERT INTO _atomic_guard(ok) SELECT CASE WHEN (' + sql + ') THEN 1 ELSE 0 END').bind(...values); }
  async batch(statements) {
    try { return await this.db.batch([...statements, this.db.prepare('DELETE FROM _atomic_guard')]); }
    catch (error) {
      if (/CHECK constraint failed.*ok|_atomic_guard/.test(error.message)) fail('Data changed in another session. Reload before saving.', 409);
      if (/UNIQUE constraint/.test(error.message)) fail('Duplicate row or account', 409);
      if (/NOT NULL|CHECK constraint/.test(error.message)) fail('Invalid row data');
      throw error;
    }
  }
  async rest(path, method = 'GET', body, prefer = 'return=representation', scope) {
    if (path.startsWith('rpc/')) return this.rpc(path.slice(4), body || {});
    const [table, query = ''] = path.split('?'); this.schema(table);
    if (method === 'GET') return this.read(table, query, undefined, false, scope);
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      if (!rows.length || rows.length > 200) fail('Send 1 to 200 rows');
      const q = new URLSearchParams(query);
      const results = await this.batch(rows.map(row => this.insertStatement(table, row, prefer.includes('merge-duplicates'), q.get('on_conflict'))));
      return results.slice(0, rows.length).flatMap(r => r.results).map(row => this.decode(table, row));
    }
    const compiled = this.query(table, query); if (!compiled.where) fail('A write filter is required');
    let statement;
    if (method === 'PATCH') statement = this.updateStatement(table, body, query);
    else if (method === 'DELETE') statement = this.db.prepare('DELETE FROM ' + quote(table) + compiled.where + ' RETURNING *').bind(...compiled.values);
    else fail('Unsupported method');
    const [result] = await this.batch([statement]);
    return result.results.map(row => this.decode(table, row));
  }
}
