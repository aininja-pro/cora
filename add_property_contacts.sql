-- Add property_contacts table for tracking people related to each property
CREATE TABLE IF NOT EXISTS property_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('buyer', 'title_company', 'inspector', 'lender', 'appraiser', 'attorney', 'contractor', 'other')),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    company TEXT,
    notes TEXT,
    status TEXT CHECK (status IN ('active', 'pending', 'qualified', 'closed', 'inactive')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add property_id to tasks table to link tasks to properties
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES listings(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_property_contacts_property_id ON property_contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_property_contacts_agent_id ON property_contacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_property_contacts_type ON property_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_tasks_property_id ON tasks(property_id);

-- Create updated_at trigger for property_contacts
CREATE OR REPLACE FUNCTION update_property_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_property_contacts_updated_at ON property_contacts;
CREATE TRIGGER update_property_contacts_updated_at
    BEFORE UPDATE ON property_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_property_contacts_updated_at();

-- Sample data for testing
INSERT INTO property_contacts (property_id, agent_id, contact_type, name, phone, email, company, notes, status)
SELECT
    l.id,
    '11111111-1111-1111-1111-111111111111',
    'buyer',
    'John Smith',
    '+1-555-0101',
    'john.smith@example.com',
    NULL,
    'Interested in quick close, pre-approved up to $500K',
    'qualified'
FROM listings l
WHERE l.address LIKE '%Main Street%'
LIMIT 1;

COMMIT;
