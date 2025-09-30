"""
API endpoints for managing property contacts (buyers, inspectors, etc)
"""

from fastapi import APIRouter, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
from pydantic import BaseModel
from ..services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/properties", tags=["property_contacts"])

class PropertyContactCreate(BaseModel):
    property_id: str
    agent_id: str = '11111111-1111-1111-1111-111111111111'
    contact_type: str  # buyer, title_company, inspector, lender, appraiser, attorney, contractor, other
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None
    status: str = 'active'

class PropertyTaskCreate(BaseModel):
    property_id: str
    agent_id: str = '11111111-1111-1111-1111-111111111111'
    title: str
    description: str
    task_type: Optional[str] = 'other'
    deadline: Optional[str] = None
    priority: str = 'normal'

@router.post("/{property_id}/contacts")
async def create_property_contact(property_id: str, contact_data: PropertyContactCreate) -> Dict[str, Any]:
    """
    Add a contact (buyer, inspector, etc) to a property
    """
    try:
        supabase = supabase_service

        # Validate contact type
        valid_types = ['buyer', 'title_company', 'inspector', 'lender', 'appraiser', 'attorney', 'contractor', 'other']
        if contact_data.contact_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid contact type. Must be one of: {valid_types}")

        # Create contact
        contact_dict = {
            "property_id": property_id,
            "agent_id": contact_data.agent_id,
            "contact_type": contact_data.contact_type,
            "name": contact_data.name,
            "phone": contact_data.phone,
            "email": contact_data.email,
            "company": contact_data.company,
            "notes": contact_data.notes,
            "status": contact_data.status,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        response = supabase.client.table("property_contacts").insert(contact_dict).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create contact")

        created_contact = response.data[0]

        logger.info(f"Created property contact: {created_contact['id']} for property {property_id}")

        return {
            "success": True,
            "message": "Contact created successfully",
            "contact": created_contact
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating property contact: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create contact")

@router.get("/{property_id}/contacts")
async def get_property_contacts(property_id: str) -> Dict[str, Any]:
    """
    Get all contacts for a property
    """
    try:
        supabase = supabase_service

        response = supabase.client.table("property_contacts").select("*").eq("property_id", property_id).order("created_at", desc=True).execute()

        contacts = response.data or []

        return {
            "success": True,
            "count": len(contacts),
            "contacts": contacts
        }

    except Exception as e:
        logger.error(f"Error fetching property contacts: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch contacts")

@router.post("/{property_id}/tasks")
async def create_property_task(property_id: str, task_data: PropertyTaskCreate) -> Dict[str, Any]:
    """
    Add a task related to a property
    """
    try:
        supabase = supabase_service

        # Create task with property_id link
        # The tasks table has: transcript (NOT NULL), task_type, status, metadata, property_id
        task_dict = {
            "property_id": property_id,
            "agent_id": task_data.agent_id,
            "transcript": f"{task_data.title}: {task_data.description}",  # Combine title and description
            "task_type": task_data.task_type,
            "status": "pending",
            "metadata": {
                "title": task_data.title,
                "description": task_data.description,
                "priority": task_data.priority,
                "property_related": True
            }
        }

        # Add deadline to metadata if provided
        if task_data.deadline:
            task_dict["metadata"]["deadline"] = task_data.deadline

        response = supabase.client.table("tasks").insert(task_dict).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create task")

        created_task = response.data[0]

        logger.info(f"Created property task: {created_task['id']} for property {property_id}")

        return {
            "success": True,
            "message": "Task created successfully",
            "task": created_task
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating property task: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create task")

@router.get("/{property_id}/tasks")
async def get_property_tasks(property_id: str) -> Dict[str, Any]:
    """
    Get all tasks for a property
    """
    try:
        supabase = supabase_service

        response = supabase.client.table("tasks").select("*").eq("property_id", property_id).order("created_at", desc=True).execute()

        tasks = response.data or []

        return {
            "success": True,
            "count": len(tasks),
            "tasks": tasks
        }

    except Exception as e:
        logger.error(f"Error fetching property tasks: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch tasks")

@router.delete("/contacts/{contact_id}")
async def delete_property_contact(contact_id: str) -> Dict[str, Any]:
    """
    Delete a property contact
    """
    try:
        supabase = supabase_service

        response = supabase.client.table("property_contacts").delete().eq("id", contact_id).execute()

        return {
            "success": True,
            "message": "Contact deleted successfully"
        }

    except Exception as e:
        logger.error(f"Error deleting property contact: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete contact")
