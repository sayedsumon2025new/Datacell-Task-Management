# শুরু করুন — Google Sheets সংস্করণ

এই সংস্করণে আগের সম্পূর্ণ Dashboard ও সব module আছে। Database থাকবে আপনার Google Drive-এর একটি private Google Sheet-এ।

## সবচেয়ে সহজ পদ্ধতি

১. নতুন Apps Script project খুলুন।
২. **Standalone-Code.gs** ফাইলের সব লেখা কপি করে project-এর **Code.gs**-এ বসিয়ে Save করুন। আলাদা HTML file লাগবে না।
৩. **Project Settings → Script Properties**-এ দুটি property দিন:

| Property | কী দেবেন |
|---|---|
| DATACELL_SOURCE_SHEET_ID | আগের DataCell - Fresh Database-এর ID; Sheet URL-এ /d/ এবং /edit-এর মাঝের অংশ |
| DATACELL_INITIAL_ADMIN_PASSWORD | নতুন application password, কমপক্ষে ১২ অক্ষর; Google account password দেবেন না |

৪. উপরের function list থেকে **setupFullDashboard_** বেছে **Run** করুন এবং Google-এর অনুমোদন দিন।
৫. Setup আগের Sheet শুধু পড়বে; data রাখার জন্য নতুন private spreadsheet তৈরি করবে।
৬. **Deploy → Test deployments** অথবা আলাদা test Web App deployment খুলুন। শুরুতে access শুধু নিজের জন্য রাখুন।
৭. Login name হবে **admin**। Password হবে ৩ নম্বর ধাপে দেওয়া application password।
৮. **Settings → User Management** থেকে অন্য user-দের নতুন application password দিন এবং প্রয়োজনীয় module access দিন।

**Work Hour Approval → User & Tab Access** থেকে সাতটি tab-এর permissions দেওয়া যাবে।

## Data সম্পর্কে

- আসল ৯৩টি Task ও User Data বদলানো হয় না।
- Setup নতুন storage-এ কপি করে; আবার চালিয়ে আগের storage replace করতে দেয় না।
- Unassigned Task-গুলো unassigned থাকবে; Master Tasks থেকে assign করবেন।
- Fresh Database-এ থাকা user-দের Google password নেওয়া বা ব্যবহার করা হয় না।
- Supabase-এ থাকা কিন্তু Fresh Database-এ নেই—এমন পুরোনো data নিজে থেকে import হবে না।
- নতুন database-এর **Storage** tab হাতে edit করবেন না; application দিয়ে পরিবর্তন করবেন।

নতুন Google deployment-এ পরীক্ষা এখনও বাকি। README.md-এর checklist শেষ করার পর production cutover করবেন।
