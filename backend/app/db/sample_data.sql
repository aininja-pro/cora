-- Sample Data for CORA Testing

-- Insert a test agent
INSERT INTO agents (id, name, email, phone, company)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Demo Agent',
    'agent@demo.com',
    '+13168670416',  -- Your Twilio number
    'Demo Realty'
);

-- Insert sample property listings
INSERT INTO listings (agent_id, address, price, beds, baths, sqft, type, description, status)
VALUES 
(
    '11111111-1111-1111-1111-111111111111',
    '123 Main Street, Austin, TX 78701',
    489000,
    3,
    2.5,
    2200,
    'house',
    'Beautiful 3-bedroom home in downtown Austin. Features include a modern kitchen with granite countertops, hardwood floors throughout, and a spacious fenced backyard with a custom patio. Perfect for families, walking distance to schools and parks.',
    'active'
),
(
    '11111111-1111-1111-1111-111111111111',
    '456 Oak Avenue, Austin, TX 78702',
    325000,
    2,
    2,
    1500,
    'condo',
    'Modern condo with city views. Open floor plan, stainless steel appliances, in-unit washer/dryer. Building amenities include gym, pool, and 24/7 concierge. Pet-friendly community.',
    'active'
),
(
    '11111111-1111-1111-1111-111111111111',
    '789 Pine Lane, Austin, TX 78703',
    750000,
    4,
    3,
    3200,
    'house',
    'Luxury home in prestigious neighborhood. Gourmet kitchen, home office, media room, and three-car garage. Pool and spa in backyard. Energy-efficient smart home features throughout.',
    'active'
);

-- Insert a sample task
INSERT INTO tasks (agent_id, transcript, task_type, status)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Follow up with John Smith about the Main Street property showing',
    'follow_up',
    'pending'
);