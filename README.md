# CORA - AI Voice Assistant for Real Estate Agents

CORA is an AI-powered voice assistant designed to help real estate agents manage listings, communicate with clients, and automate routine tasks through natural voice commands.

## 🚀 Quick Start

### Prerequisites
- Node.js v22+ 
- Python 3.12+
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/aininja-pro/cora.git
cd cora
```

2. Set up the backend:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Set up the frontend:
```bash
cd ../frontend
npm install
```

### Configuration

1. **Backend Configuration** - Copy and update `/backend/.env`:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase anon key
   - `OPENAI_API_KEY`: Your OpenAI API key
   - Other API keys as needed

2. **Frontend Configuration** - The `/frontend/.env` is pre-configured for local development.

3. **Supabase Setup**:
   - Create a new Supabase project
   - Run the SQL schema: `/backend/app/db/schema.sql`
   - Update the connection string in `.cursor/mcp.json`
   - Instructions: https://supabase.com/docs/guides/getting-started/mcp#connect-to-supabase-using-mcp

### Running the Application

1. Start the backend server:
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```
Backend will be available at: http://localhost:8000

2. Start the frontend development server:
```bash
cd frontend
npm run dev
```
Frontend will be available at: http://localhost:5173

## 🎨 Brand Colors

- **Primary (Navy)**: #1B2A41
- **Accent (Coral)**: #FF6B6B  
- **Background (Cream)**: #FFF8F3

## 📚 Documentation

For detailed documentation, see the `/documentation` folder.

## 🤝 Contributing

Please read our contributing guidelines before submitting PRs.

## 📄 License

This project is proprietary and confidential.