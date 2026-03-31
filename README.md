# Iowa Grant Scanner

Discover small business grants available in Iowa. Built for small business owners and aspiring entrepreneurs.

## Features

- **Grant Discovery** - Automatically scans Grants.gov, SAM.gov, and Iowa Economic Development Authority
- **Smart Categorization** - Filters by gender focus, business stage, grant type, eligible expenses, and location
- **AI-Powered PDF Parsing** - Extracts grant details from dense PDF documents using Claude API
- **Deadline Calendar** - Visual calendar view of upcoming grant deadlines
- **Change Detection** - Only re-parses sources when content actually changes
- **Shadow API Hunting** - Registry for discovered hidden JSON endpoints to get clean data

## Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **AI:** Claude API for PDF parsing and categorization
- **Scraping:** Axios + Cheerio
- **Styling:** Tailwind CSS
- **Deployment:** Railway

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Anthropic API key (for PDF parsing)

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Trigger a Scrape

```bash
# Without CRON_SECRET set:
curl -X POST http://localhost:3000/api/scraper

# With CRON_SECRET set:
curl -X POST http://localhost:3000/api/scraper \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Deploy on Railway

1. Create a new project on Railway
2. Add a PostgreSQL service
3. Connect your GitHub repo
4. Set environment variables (see `.env.example`)
5. Railway auto-detects Next.js and deploys

### Cron Setup

Set up a Railway cron service to hit `POST /api/scraper` every 6 hours to keep grants updated.

## API Endpoints

- `GET /api/grants` - List grants with filters
  - Query params: `search`, `grantType`, `gender`, `businessStage`, `status`, `eligibleExpense`, `location`, `amountMin`, `amountMax`, `page`, `limit`
- `GET /api/grants/calendar` - Grants grouped by deadline month
  - Query params: `year`, `month`
- `POST /api/scraper` - Trigger a full scrape (protected by `CRON_SECRET`)

## Data Sources

| Source | Type | Auth Required |
|--------|------|---------------|
| Grants.gov | API | No |
| SAM.gov | API | Yes (API key) |
| Iowa EDA | Web scrape | No |
| Shadow APIs | JSON endpoints | Varies |
| PDF documents | AI parsing | Anthropic key |
