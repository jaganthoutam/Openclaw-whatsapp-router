"""
WhatsApp Router API Client — used by bot-manager
==================================================
Openclaw-UI  →  bot-manager  →  router_client.py  →  WhatsApp Router API

This module is the only piece of bot-manager that talks to the router.
Import it and call the functions below from your bot-manager endpoints.

All functions raise RouterAPIError on non-2xx responses.
"""

import os
import json
import logging
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("bot-manager.router-client")

ROUTER_BASE_URL  = os.getenv("WHATSAPP_ROUTER_URL",    "http://openclaw-router.openclaw.svc.cluster.local:3000")
ROUTER_ADMIN_KEY = os.getenv("WHATSAPP_ROUTER_SECRET", "changeme")


class RouterAPIError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"Router API HTTP {status}: {body}")
        self.status = status
        self.body   = body


def _request(method: str, path: str, payload: Optional[dict] = None) -> dict:
    url  = f"{ROUTER_BASE_URL}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req  = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type":   "application/json",
            "X-Admin-Secret": ROUTER_ADMIN_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        raise RouterAPIError(e.code, e.read().decode()) from e


# ─── Tenant management ────────────────────────────────────────────────────────

@dataclass
class TenantConfig:
    tenant_id:              str
    openclaw_extension_url: str
    sender_numbers:         list[str]
    enabled:                bool = True


def register_tenant(cfg: TenantConfig) -> dict:
    """
    Create or replace a tenant in the router registry.
    Call this when an OpenClaw instance is first linked to a WhatsApp number.
    """
    log.info(f"Registering tenant {cfg.tenant_id} with {len(cfg.sender_numbers)} number(s)")
    return _request("POST", "/admin/tenants", {
        "tenantId":            cfg.tenant_id,
        "openclawExtensionUrl": cfg.openclaw_extension_url,
        "senderNumbers":       cfg.sender_numbers,
        "enabled":             cfg.enabled,
    })


def get_tenant(tenant_id: str) -> dict:
    """Get a single tenant mapping."""
    return _request("GET", f"/admin/tenants/{tenant_id}")


def list_tenants() -> list[dict]:
    """Get all tenant mappings."""
    return _request("GET", "/admin/tenants").get("tenants", [])


def add_number(tenant_id: str, number: str) -> dict:
    """
    Add a WhatsApp number to an existing tenant.
    Call this when a user links a new number in Openclaw-UI.

    number: E.164 digits without +, e.g. "919812345678"
    """
    log.info(f"Adding number {number} to tenant {tenant_id}")
    return _request("POST", f"/admin/tenants/{tenant_id}/numbers", {"number": number})


def remove_number(tenant_id: str, number: str) -> dict:
    """
    Remove a WhatsApp number from a tenant.
    Call this when a user unlinks a number in Openclaw-UI.
    """
    log.info(f"Removing number {number} from tenant {tenant_id}")
    return _request("DELETE", f"/admin/tenants/{tenant_id}/numbers/{number}")


def enable_tenant(tenant_id: str) -> dict:
    """Resume routing for a tenant."""
    log.info(f"Enabling tenant {tenant_id}")
    return _request("PATCH", f"/admin/tenants/{tenant_id}", {"enabled": True})


def disable_tenant(tenant_id: str) -> dict:
    """Pause routing for a tenant without deleting the mapping."""
    log.info(f"Disabling tenant {tenant_id}")
    return _request("PATCH", f"/admin/tenants/{tenant_id}", {"enabled": False})


def remove_tenant(tenant_id: str) -> None:
    """Permanently delete a tenant mapping."""
    log.info(f"Removing tenant {tenant_id}")
    _request("DELETE", f"/admin/tenants/{tenant_id}")


# ─── WhatsApp session status ──────────────────────────────────────────────────

def get_whatsapp_status() -> dict:
    """
    Returns the router's WhatsApp connection state.
    Possible values: connecting | qr_ready | open | closed | logged_out
    """
    return _request("GET", "/admin/whatsapp/status")


def get_qr_url() -> str:
    """Returns the URL the Openclaw-UI should open/embed to show the QR code."""
    return f"{ROUTER_BASE_URL}/admin/whatsapp/qr"
