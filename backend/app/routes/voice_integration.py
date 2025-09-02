"""
Voice integration API endpoints for CORA Realtime Voice Server
Handles call lifecycle, tool execution, and event streaming
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from typing import Optional, List, Dict, Any, Literal, Union
from datetime import datetime, timedelta, timezone
import logging
import jwt
import uuid
import os
import time
import hashlib
import json
from pydantic import BaseModel, Field
from ..services.supabase_service import SupabaseService
from ..services.property_search_service import property_search_service, PropertySearchFilter
from ..services.call_analysis_service import CallAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["voice-integration"])

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "voice-integration-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_TTL_MINUTES = int(os.getenv("JWT_TTL_MIN", "15"))

# ===== DTOs =====

class CreateCallRequest(BaseModel):
    tenant_id: str
    caller_number: str 
    agent_number: str
    twilio_sid: str

class TenantConfig(BaseModel):
    id: str
    name: str
    agent_display_name: str
    brand_name: str

class AgentConfig(BaseModel):
    id: str
    name: str

class CreateCallResponse(BaseModel):
    call_id: str
    jwt_token: str
    tenant: TenantConfig
    agent: AgentConfig

class CallEvent(BaseModel):
    type: Literal["turn", "tool_call", "tool_result", "status", "summary"]
    ts: Union[datetime, str]
    role: Optional[Literal["user", "assistant"]] = None
    text: Optional[str] = None
    ms: Optional[int] = None
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    outcome: Optional[str] = None
    next_actions: Optional[List[str]] = None

class ToolExecuteRequest(BaseModel):
    call_id: str
    tenant_id: str
    tool: Literal["search_properties", "book_showing", "qualify_lead", "request_callback", "transfer_to_human"]
    args: Dict[str, Any]

class ToolError(BaseModel):
    code: Literal["VALIDATION_FAILED", "NOT_FOUND", "TOOL_FAILED", "TIMEOUT"]
    message: str
    retryable: bool

class ToolEnvelope(BaseModel):
    ok: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[ToolError] = None

# ===== JWT Middleware =====

def create_call_jwt(call_id: str, tenant_id: str, request_id: str) -> str:
    """Create JWT token scoped to specific call and tenant"""
    now = datetime.utcnow()
    payload = {
        "sub": call_id,
        "tenant_id": tenant_id,
        "scope": ["events", "tools"],
        "iat": now,
        "exp": now + timedelta(minutes=JWT_TTL_MINUTES),
        "jti": f"{request_id}_{int(now.timestamp())}"
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.info(f"[{request_id}] Minted JWT for call_id={call_id} tenant_id={tenant_id} exp={payload['exp']}")
    
    return token

def verify_call_jwt(authorization: str = Header(None)) -> Dict[str, str]:
    """Verify JWT token and extract call context"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization header required"
        )
    
    token = authorization.split(" ")[1]
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Verify scope
        if "events" not in payload.get("scope", []) and "tools" not in payload.get("scope", []):
            raise HTTPException(status_code=403, detail="Insufficient scope")
            
        return {
            "call_id": payload["sub"],
            "tenant_id": payload["tenant_id"]
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ===== Routes =====

@router.post("/calls", response_model=CreateCallResponse)
async def create_call(request: CreateCallRequest, req: Request) -> CreateCallResponse:
    """
    Create new call record and mint JWT token for voice server
    IDEMPOTENT: Returns existing call_id for same twilio_sid, mints fresh JWT
    """
    request_id = str(uuid.uuid4())
    start_time = time.time()
    
    try:
        supabase = SupabaseService()
        
        # CRITICAL: Idempotent call creation on twilio_sid
        try:
            # Try to find existing call
            existing = supabase.client.table("calls").select("*").eq("twilio_sid", request.twilio_sid).single().execute()
            call_id = existing.data["id"]
            
            logger.info(f"[{request_id}] Found existing call: {call_id} for twilio_sid: {request.twilio_sid}")
            
        except Exception:
            # Create new call record
            call_data = {
                "tenant_id": request.tenant_id,
                "twilio_sid": request.twilio_sid,
                "caller_number": request.caller_number,
                "agent_number": request.agent_number,
                "started_at": datetime.utcnow().isoformat()
            }
            
            result = supabase.client.table("calls").insert(call_data).execute()
            call_id = result.data[0]["id"]
            
            logger.info(f"[{request_id}] Created new call: {call_id} for twilio_sid: {request.twilio_sid}")
        
        # Always mint fresh JWT (15-minute scope)
        jwt_token = create_call_jwt(call_id, request.tenant_id, request_id)
        
        # TODO: Replace with real tenant lookup from tenants table
        tenant = TenantConfig(
            id=request.tenant_id,
            name="Ray Richards Real Estate",
            agent_display_name="Ray Richards",
            brand_name="CORA"
        )
        
        agent = AgentConfig(
            id="agt_ray",
            name="Ray Richards"
        )
        
        # Observability
        latency_ms = round((time.time() - start_time) * 1000)
        logger.info(f"[{request_id}] SUCCESS /api/calls call_id={call_id} tenant_id={request.tenant_id} latency_ms={latency_ms}")
        
        response = CreateCallResponse(
            call_id=call_id,
            jwt_token=jwt_token,
            tenant=tenant,
            agent=agent
        )
        
        # Add trace header
        return response
        
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000)
        logger.error(f"[{request_id}] ERROR /api/calls tenant_id={request.tenant_id} latency_ms={latency_ms} error={str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create call")

@router.post("/calls/{call_id}/events")
async def add_call_event(
    call_id: str,
    evt: CallEvent,
    request: Request,
    auth: Dict[str, str] = Depends(verify_call_jwt)
) -> Dict[str, bool]:
    """
    Add event to call timeline (turn, tool call/result, status, summary) - FAIL LOUDLY VERSION
    """
    # 1) Auth + path sanity
    if auth["call_id"] != call_id:
        raise HTTPException(status_code=403, detail="call_id scope mismatch")

    # 2) Normalize timestamp
    if isinstance(evt.ts, str):
        try:
            ts = datetime.fromisoformat(evt.ts.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid timestamp format: {evt.ts}")
    else:
        ts = evt.ts or datetime.now(timezone.utc)
    
    # 3) Only process turn events with text
    if evt.type != "turn" or not evt.text:
        logger.info(f"Skipped {evt.type} event (not a turn with text)")
        return {"ok": True, "skipped": True}
        
    payload = {
        "call_id": call_id,
        "speaker": evt.role,
        "message": evt.text,
        "timestamp": ts.isoformat(),
        "sequence_number": int(time.time() % 1000000)  # Keep it under 1M to fit in INTEGER
    }

    # 4) Persist with explicit error handling
    supabase = SupabaseService()
    try:
        res = supabase.client.table("call_transcripts").insert(payload).execute()
    except Exception as e:
        # Network/client error
        raise HTTPException(status_code=502, detail=f"supabase client error: {e!s}")

    # 5) Check Supabase response
    data = getattr(res, "data", None)
    error = getattr(res, "error", None)
    if error:
        # RLS/constraints/validation error -> surface it
        raise HTTPException(status_code=500, detail=f"supabase insert error: {error}")
    if not data:
        # Some clients return None on error; be strict
        raise HTTPException(status_code=500, detail="supabase returned no data")

    logger.info(f"SUCCESS: Saved {evt.role} turn to call_transcripts: {evt.text[:50]}...")
    return {"ok": True, "inserted": len(data)}

@router.post("/tools/execute", response_model=ToolEnvelope)
async def execute_tool(
    request: ToolExecuteRequest,
    req: Request,
    auth: Dict[str, str] = Depends(verify_call_jwt),
    idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key")
) -> ToolEnvelope:
    """
    Execute business tool and return envelope for OpenAI
    Supports idempotency for booking/callback tools
    """
    request_id = str(uuid.uuid4())
    start_time = time.time()
    
    try:
        # CRITICAL: Verify tenant_id and call_id match JWT
        if auth["tenant_id"] != request.tenant_id or auth["call_id"] != request.call_id:
            logger.warning(f"[{request_id}] 403 Auth mismatch: JWT=({auth['call_id']},{auth['tenant_id']}) vs req=({request.call_id},{request.tenant_id})")
            raise HTTPException(status_code=403, detail="Auth context mismatch")
        
        # Rate limiting check (10 req/s per call)
        # TODO: Implement with Redis/memory cache
        
        supabase = SupabaseService()
        
        # Route to appropriate tool handler
        result = None
        if request.tool == "search_properties":
            result = await handle_search_properties(request.args, supabase, request_id)
        elif request.tool == "book_showing":
            result = await handle_book_showing(request.args, supabase, auth["tenant_id"], request_id, idempotency_key)
        elif request.tool == "qualify_lead":
            result = await handle_qualify_lead(request.args, supabase, auth["call_id"], request_id)
        elif request.tool == "request_callback":
            result = await handle_request_callback(request.args, supabase, auth["tenant_id"], request_id, idempotency_key)
        elif request.tool == "transfer_to_human":
            result = await handle_transfer_to_human(request.args, supabase, request_id)
        else:
            result = ToolEnvelope(
                ok=False,
                error=ToolError(
                    code="NOT_FOUND",
                    message=f"Unknown tool: {request.tool}",
                    retryable=False
                )
            )
        
        # Observability
        latency_ms = round((time.time() - start_time) * 1000)
        status = "SUCCESS" if result.ok else "TOOL_ERROR"
        logger.info(f"[{request_id}] {status} /api/tools/execute tool={request.tool} call_id={request.call_id} tenant_id={request.tenant_id} latency_ms={latency_ms}")
        
        return result
            
    except HTTPException:
        raise
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000)
        logger.error(f"[{request_id}] ERROR /api/tools/execute tool={request.tool} call_id={request.call_id} tenant_id={request.tenant_id} latency_ms={latency_ms} error={str(e)}")
        
        return ToolEnvelope(
            ok=False,
            error=ToolError(
                code="TOOL_FAILED",
                message="Internal server error",
                retryable=False
            )
        )

@router.get("/calls")
async def list_calls(
    tenant_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None
) -> Dict[str, Any]:
    """
    List calls for UI with pagination
    """
    try:
        supabase = SupabaseService()
        
        query = supabase.client.table("calls").select("*")
        
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        if status:
            query = query.eq("status", status)
            
        query = query.order("started_at", desc=True)
        query = query.range((page - 1) * page_size, page * page_size - 1)
        
        result = query.execute()
        
        return {
            "calls": result.data,
            "page": page,
            "page_size": page_size,
            "total": len(result.data)  # TODO: Get actual count
        }
        
    except Exception as e:
        logger.error(f"Error listing calls: {e}")
        raise HTTPException(status_code=500, detail="Failed to list calls")

@router.get("/calls/{call_id}")
async def get_call_detail(call_id: str) -> Dict[str, Any]:
    """
    Get call details including timeline of turns and tool events
    """
    try:
        supabase = SupabaseService()
        
        # Get call record
        call_result = supabase.client.table("calls").select("*").eq("id", call_id).single().execute()
        call = call_result.data
        
        # Get call transcript from call_transcripts table
        transcript_result = supabase.client.table("call_transcripts").select("*").eq("call_id", call_id).order("sequence_number").execute()
        transcript_entries = transcript_result.data or []
        
        # Convert to timeline format
        turns = []
        for entry in transcript_entries:
            turns.append({
                "type": "turn",
                "role": entry["speaker"],
                "text": entry["message"],
                "ts": entry["timestamp"]
            })
        
        return {
            "call": call,
            "turns": turns,
            "transcript_entries": transcript_entries,
            "total_turns": len(turns)
        }
        
    except Exception as e:
        logger.error(f"Error getting call detail: {e}")
        raise HTTPException(status_code=500, detail="Failed to get call detail")

@router.post("/calls/{call_id}/analyze")
async def analyze_call(call_id: str) -> Dict[str, Any]:
    """
    Analyze call transcript and generate rich summary
    """
    try:
        supabase = SupabaseService()
        analysis_service = CallAnalysisService()
        
        # Get call transcript from call_transcripts table (fallback)
        try:
            transcript_result = supabase.client.table("call_transcripts").select("*").eq("call_id", call_id).order("sequence_number").execute()
            transcript_entries = transcript_result.data or []
        except:
            # Try call_turns table if available
            turns_result = supabase.client.table("call_turns").select("*").eq("call_id", call_id).eq("type", "turn").order("ts").execute()
            transcript_entries = []
            for turn in turns_result.data or []:
                transcript_entries.append({
                    "speaker": turn["role"],
                    "message": turn["text"],
                    "timestamp": turn["ts"]
                })
        
        if not transcript_entries:
            return {
                "success": False,
                "error": "No transcript found for analysis"
            }
        
        # Get call info
        call_result = supabase.client.table("calls").select("*").eq("id", call_id).single().execute()
        call_info = call_result.data
        
        # Run GPT analysis
        analysis = await analysis_service.analyze_call_transcript(transcript_entries, call_info)
        
        # Update calls table with analysis
        if analysis:
            update_data = {
                "caller_name": analysis.get("caller_name"),
                "lead_quality": analysis.get("lead_quality"), 
                "call_type": analysis.get("call_type"),
                "ai_response": json.dumps(analysis),  # Store full analysis
                "summary": analysis.get("call_summary")
            }
            
            # Remove None values
            update_data = {k: v for k, v in update_data.items() if v is not None}
            
            supabase.client.table("calls").update(update_data).eq("id", call_id).execute()
        
        return {
            "success": True,
            "analysis": analysis,
            "transcript_entries": transcript_entries
        }
        
    except Exception as e:
        logger.error(f"Error analyzing call {call_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze call")


@router.post("/calls/{twilio_sid}/trigger-sms")
async def trigger_sms_for_call(twilio_sid: str, request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trigger SMS notifications for a completed call using Twilio SID.
    Used when call session is no longer in memory but we need to send SMS.
    """
    try:
        supabase = SupabaseService()
        
        # Find the call by Twilio SID
        call_result = supabase.client.table("calls").select("*").eq("twilio_sid", twilio_sid).single().execute()
        
        if not call_result.data:
            logger.error(f"Call not found for Twilio SID: {twilio_sid}")
            return {"success": False, "error": "Call not found"}
        
        call_data = call_result.data
        call_id = call_data["id"]
        caller_number = call_data.get("caller_number")
        
        logger.info(f"Triggering SMS for completed call: {call_id} (Twilio: {twilio_sid})")
        
        # Get transcript for OpenAI analysis
        transcript_result = supabase.client.table("call_transcripts").select("*").eq("call_id", call_id).order("sequence_number").execute()
        transcript_entries = transcript_result.data or []
        
        if not transcript_entries:
            logger.warning(f"No transcript found for call {call_id}, using basic summary")
            summary = f"Call from {caller_number} - no transcript available for analysis"
        else:
            # Run OpenAI analysis to get SMS-optimized summary
            analysis_service = CallAnalysisService()
            analysis = await analysis_service.analyze_call_transcript(transcript_entries, call_data)
            
            # Use OpenAI's SMS-optimized summary if available
            summary = analysis.get("sms_summary") if analysis else None
            
            if not summary:
                # Fallback to call_summary if no sms_summary
                summary = analysis.get("call_summary") if analysis else f"Call from {caller_number} about real estate inquiry"
        
        # Ensure summary fits SMS length
        if len(summary) > 240:
            summary = summary[:237] + "..."
        
        # Send agent summary SMS  
        try:
            import requests
            sms_response = requests.post("http://localhost:8000/api/notifications/sms", json={
                "tenant_id": "default",  # TODO: Get from call data
                "to": "+13162187747",  # TODO: Get agent number from tenant
                "template": "agent_summary", 
                "payload": {
                    "call_id": call_id,
                    "summary": summary,
                    "actions_link": f"/calls/{call_id}",
                    "caller_number": caller_number,
                    "outcome": "completed"
                },
                "idempotency_key": f"call_{call_id}_summary_ai"
            })
            
            if sms_response.status_code == 200:
                logger.info(f"✅ SMS triggered successfully for call {call_id}")
                return {"success": True, "sms_sent": True, "call_id": call_id}
            else:
                logger.error(f"❌ SMS failed for call {call_id}: {sms_response.status_code}")
                return {"success": True, "sms_sent": False, "error": "SMS failed"}
                
        except Exception as sms_error:
            logger.error(f"❌ SMS error for call {call_id}: {sms_error}")
            return {"success": True, "sms_sent": False, "error": str(sms_error)}
        
    except Exception as e:
        logger.error(f"Error triggering SMS for call {twilio_sid}: {e}")
        raise HTTPException(status_code=500, detail="Failed to trigger SMS")


# ===== Tool Handlers (Stubs) =====

async def handle_search_properties(args: Dict[str, Any], supabase: SupabaseService, request_id: str) -> ToolEnvelope:
    """Search properties using shared service"""
    try:
        # Convert voice tool args to search filter
        search_filter = PropertySearchFilter(
            city=args.get("city"),
            min_price=args.get("minPrice"),
            max_price=args.get("maxPrice"),
            beds_min=args.get("beds"),
            baths_min=args.get("baths"),
            status="active",  # Voice only searches active properties
            page=1,
            page_size=5,  # Limit for voice interface
            sort="price_desc"
        )
        
        # Use shared search service
        search_result = await property_search_service.search(search_filter, request_id)
        
        # Convert to voice tool format
        results = []
        for prop in search_result.items:
            results.append({
                "id": prop.id,
                "address": prop.address,
                "price": prop.price,
                "beds": prop.beds,
                "baths": prop.baths,
                "sqft": prop.sqft,
                "status": prop.status,
                "type": prop.type,
                "photos": prop.photos,
                "features": prop.features
            })
        
        message = f"Found {len(results)} properties"
        if args.get("city"):
            message += f" in {args['city']}"
        if len(results) == 0:
            message = f"No properties found matching your criteria" + (f" in {args.get('city')}" if args.get('city') else "")
        
        logger.info(f"[{request_id}] Property search: {len(results)}/{search_result.total} results")
        
        return ToolEnvelope(
            ok=True,
            data={
                "total": search_result.total,
                "results": results,
                "message": message
            }
        )
        
    except Exception as e:
        logger.error(f"[{request_id}] Property search failed: {str(e)}")
        return ToolEnvelope(
            ok=False,
            error=ToolError(code="TOOL_FAILED", message="Property search unavailable", retryable=True)
        )

async def handle_book_showing(args: Dict[str, Any], supabase: SupabaseService, tenant_id: str, request_id: str, idempotency_key: Optional[str]) -> ToolEnvelope:
    """Book property showing with idempotency"""
    try:
        # Validate required fields
        if not all(k in args for k in ["propertyId", "datetimeISO", "contact"]):
            return ToolEnvelope(
                ok=False,
                error=ToolError(code="VALIDATION_FAILED", message="Missing required fields", retryable=False)
            )
        
        contact = args["contact"]
        if not all(k in contact for k in ["name", "phone"]):
            return ToolEnvelope(
                ok=False,
                error=ToolError(code="VALIDATION_FAILED", message="Missing contact info", retryable=False)
            )
        
        # Idempotency check
        if idempotency_key:
            # TODO: Check if booking already exists with this key
            pass
        
        # Create appointment record (TODO: Replace with real appointments table)
        confirmation_id = f"SHOW-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # TODO: Insert into appointments table when available
        appointment_data = {
            "property_id": args["propertyId"],
            "scheduled_date": args["datetimeISO"],
            "client_name": contact["name"],
            "client_phone": contact["phone"],
            "client_email": contact.get("email"),
            "tenant_id": tenant_id,
            "status": "scheduled",
            "confirmation_id": confirmation_id
        }
        
        logger.info(f"[{request_id}] Booking scheduled: {confirmation_id} for {contact['name']}")
        
        return ToolEnvelope(
            ok=True,
            data={
                "confirmation_id": confirmation_id,
                "property_id": args["propertyId"],
                "datetime": args["datetimeISO"],
                "contact": contact,
                "message": f"Perfect! I've scheduled your showing for {datetime.fromisoformat(args['datetimeISO'].replace('Z', '+00:00')).strftime('%A, %B %d at %I:%M %p')}. {contact['name']}, I'll send a confirmation to {contact['phone']}."
            }
        )
        
    except Exception as e:
        logger.error(f"[{request_id}] Booking failed: {str(e)}")
        return ToolEnvelope(
            ok=False,
            error=ToolError(code="TOOL_FAILED", message="Booking system unavailable", retryable=True)
        )

async def handle_qualify_lead(args: Dict[str, Any], supabase: SupabaseService, call_id: str, request_id: str) -> ToolEnvelope:
    """Qualify potential lead and create/update lead record"""
    try:
        # Calculate lead score based on qualification answers
        score = 50  # Base score
        
        if args.get("budget") and args["budget"] > 300000:
            score += 20
        
        financing = args.get("financingStatus")
        if financing == "preapproved":
            score += 30
        elif financing == "prequalified":
            score += 20
        
        if args.get("timeline") and "month" in args["timeline"].lower():
            score += 15
        
        # Create lead record (TODO: Replace with real lead_capture table insert)
        lead_id = f"LEAD-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        lead_data = {
            "call_id": call_id,
            "intent": args["intent"],
            "budget": args.get("budget"),
            "timeline": args.get("timeline"),
            "financing_status": financing,
            "score": score,
            "created_at": datetime.utcnow().isoformat()
        }
        
        logger.info(f"[{request_id}] Lead qualified: {lead_id} score={score} intent={args['intent']}")
        
        message = "Great! You're well-positioned to move forward. Let me help you find the perfect property." if score >= 70 else "I'd be happy to help you get started on your real estate journey."
        
        return ToolEnvelope(
            ok=True,
            data={
                "lead_id": lead_id,
                "score": score,
                "intent": args["intent"],
                "budget": args.get("budget"),
                "timeline": args.get("timeline"),
                "financing_status": financing,
                "message": message
            }
        )
        
    except Exception as e:
        logger.error(f"[{request_id}] Lead qualification failed: {str(e)}")
        return ToolEnvelope(
            ok=False,
            error=ToolError(code="TOOL_FAILED", message="Lead qualification unavailable", retryable=True)
        )

async def handle_request_callback(args: Dict[str, Any], supabase: SupabaseService, tenant_id: str, request_id: str, idempotency_key: Optional[str]) -> ToolEnvelope:
    """Schedule callback request with SMS trigger"""
    try:
        # Validate phone number
        if not args.get("phone"):
            return ToolEnvelope(
                ok=False,
                error=ToolError(code="VALIDATION_FAILED", message="Phone number required", retryable=False)
            )
        
        # Create callback task
        callback_id = f"CB-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Calculate callback timeframe based on reason
        timeframe = "15 minutes" if args.get("reason") == "status_update" else "30 minutes"
        
        # TODO: Insert into tasks table and trigger SMS
        task_data = {
            "tenant_id": tenant_id,
            "type": "callback",
            "phone": args["phone"],
            "reason": args["reason"],
            "scheduled_time": (datetime.utcnow() + timedelta(minutes=30)).isoformat(),
            "status": "pending",
            "callback_id": callback_id
        }
        
        logger.info(f"[{request_id}] Callback scheduled: {callback_id} to {args['phone']}")
        
        return ToolEnvelope(
            ok=True,
            data={
                "callback_id": callback_id,
                "phone": args["phone"],
                "reason": args["reason"],
                "timeframe": timeframe,
                "message": f"I've scheduled a callback to {args['phone']} within the next {timeframe} regarding {args['reason'].replace('_', ' ')}. An agent will reach out soon."
            }
        )
        
    except Exception as e:
        logger.error(f"[{request_id}] Callback failed: {str(e)}")
        return ToolEnvelope(
            ok=False,
            error=ToolError(code="TOOL_FAILED", message="Callback system unavailable", retryable=True)
        )

async def handle_transfer_to_human(args: Dict[str, Any], supabase: SupabaseService, request_id: str) -> ToolEnvelope:
    """Transfer call to human agent via Twilio"""
    try:
        queue = args.get("queue", "primary_agent")
        urgency = args.get("urgency", "normal")
        
        # Estimate wait time based on queue and urgency
        wait_times = {
            "primary_agent": "2-3 minutes",
            "after_hours": "5-10 minutes", 
            "spanish_line": "3-5 minutes"
        }
        
        if urgency == "urgent":
            wait_time = "1 minute"
        else:
            wait_time = wait_times.get(queue, "2-3 minutes")
        
        transfer_id = f"XFER-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # TODO: Trigger Twilio warm transfer to queue
        transfer_data = {
            "queue": queue,
            "urgency": urgency,
            "transfer_id": transfer_id,
            "estimated_wait": wait_time
        }
        
        logger.info(f"[{request_id}] Transfer initiated: {transfer_id} to {queue} ({urgency})")
        
        return ToolEnvelope(
            ok=True,
            data={
                "transfer_id": transfer_id,
                "queue": queue,
                "urgency": urgency,
                "estimated_wait": wait_time,
                "message": f"I'm connecting you to an agent now. Your estimated wait time is {wait_time}."
            }
        )
        
    except Exception as e:
        logger.error(f"[{request_id}] Transfer failed: {str(e)}")
        return ToolEnvelope(
            ok=False,
            error=ToolError(code="TOOL_FAILED", message="Transfer system unavailable", retryable=True)
        )