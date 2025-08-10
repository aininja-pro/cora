# CORA Multi-Agent Setup Guide

## Architecture Overview

### Phase 1: Shared Infrastructure (Current Focus)
- Single Synthflow account with multiple phone numbers
- Each agent gets assigned a dedicated phone number
- Backend identifies agent based on called number
- Centralized billing and management

### Database Changes Needed

```sql
-- Add phone_number to agents table
ALTER TABLE agents ADD COLUMN assigned_phone_number VARCHAR(20) UNIQUE;

-- Link calls to specific agents
ALTER TABLE calls ADD COLUMN agent_id UUID REFERENCES agents(id);
```

### Backend Changes Required

1. **Webhook Handler Update** (`/api/synthflow/webhook`)
```python
# Identify agent by phone number called
called_number = payload.get("to_number") or payload.get("called_number")
agent = get_agent_by_phone(called_number)

# Process call with agent context
response = process_call_for_agent(agent_id, caller_message)
```

2. **Agent Registration Flow**
```python
@router.post("/api/agents/register")
async def register_agent(agent_data):
    # Create agent account
    # Assign available phone number from pool
    # Configure agent preferences
    # Send welcome email with phone number
```

### Synthflow Configuration

#### For Multiple Numbers:
1. In Synthflow, add multiple phone numbers to your account
2. All numbers use the same webhook URL
3. Backend differentiates by the "to_number" field

#### Webhook Payload with Agent Context:
```json
{
  "from_number": "+1234567890",  // Caller's number
  "to_number": "+19876543210",    // Agent's assigned number
  "query": "Tell me about 123 Main Street",
  "call_id": "abc-123"
}
```

## Phase 2: Bring Your Own Synthflow (Future)

### Agent Onboarding Process:
1. Agent signs up for CORA account
2. Agent creates their own Synthflow account
3. Agent enters their Synthflow API credentials in CORA
4. CORA auto-configures their Synthflow webhook settings
5. Agent's calls flow through their Synthflow → CORA backend

### API Key Management:
```python
# Store in agents table
ALTER TABLE agents ADD COLUMN synthflow_api_key VARCHAR(255);
ALTER TABLE agents ADD COLUMN synthflow_account_id VARCHAR(100);
```

### Webhook Security:
```python
# Verify webhook calls are from legitimate Synthflow accounts
@router.post("/api/synthflow/webhook/{agent_id}")
async def agent_specific_webhook(agent_id: str, request: Request):
    # Verify webhook signature
    # Process for specific agent
```

## Phase 3: White-Label Platform (Long-term)

### Provider Abstraction Layer:
```python
class VoiceProvider(ABC):
    @abstractmethod
    async def handle_inbound_call(self, payload):
        pass
    
    @abstractmethod
    async def make_outbound_call(self, to_number, script):
        pass

class SynthflowProvider(VoiceProvider):
    # Synthflow implementation

class TwilioProvider(VoiceProvider):
    # Twilio implementation

class BlandAIProvider(VoiceProvider):
    # Bland.ai implementation
```

### Agent Portal Features:
- Choose preferred voice provider
- Upload custom voice training
- Set business hours
- Configure call routing rules
- View analytics dashboard

## Billing Models

### Option 1: Subscription + Usage
- Monthly subscription: $99/agent
- Includes: 500 minutes
- Overage: $0.25/minute
- Agent gets dedicated number

### Option 2: Bring Your Own Provider
- Monthly platform fee: $49/agent
- Agent pays their own provider costs
- Access to CRM, calendar, analytics

### Option 3: Enterprise White-Label
- Custom pricing
- Dedicated infrastructure
- Custom branding
- SLA guarantees

## Implementation Timeline

### Week 1-2: Multi-Phone Support
- [ ] Add agent_id to calls table
- [ ] Update webhook to identify agent by phone
- [ ] Create agent phone assignment system

### Week 3-4: Agent Dashboard
- [ ] Build agent-specific login
- [ ] Create agent settings page
- [ ] Add call history filtering by agent

### Week 5-6: Billing Integration
- [ ] Integrate Stripe for subscriptions
- [ ] Add usage tracking
- [ ] Create billing dashboard

### Month 2: Advanced Features
- [ ] Multiple provider support
- [ ] Custom voice training
- [ ] Advanced analytics
- [ ] Team management features

## Technical Considerations

### Security:
- JWT tokens for agent authentication
- Webhook signature verification
- Rate limiting per agent
- Encrypted storage of API keys

### Scalability:
- Use connection pooling for database
- Implement caching for agent lookups
- Queue system for webhook processing
- CDN for static assets

### Monitoring:
- Track calls per agent
- Monitor webhook response times
- Alert on failed calls
- Usage analytics per agent