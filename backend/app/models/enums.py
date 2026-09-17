"""String enums shared by models and API schemas.

Stored as plain VARCHAR so the schema stays portable and readable when the
owner exports or inspects the database directly.
"""
from enum import Enum


class UserRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    STAFF = "staff"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class MembershipStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class MemberStatus(str, Enum):
    """Derived (not stored) - what the owner sees next to a member's name."""
    ACTIVE = "active"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"
    NO_MEMBERSHIP = "no_membership"
    ARCHIVED = "archived"


class PaymentMethod(str, Enum):
    CASH = "cash"
    UPI = "upi"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    OTHER = "other"


class PaymentKind(str, Enum):
    MEMBERSHIP = "membership"   # paid against a specific membership
    ADVANCE = "advance"         # paid ahead, not tied to a membership yet
    OTHER = "other"


class StaffRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    TRAINER = "trainer"
    OTHER = "other"


class StaffStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class SalaryRecordKind(str, Enum):
    SALARY = "salary"
    ADVANCE = "advance"
    OTHER = "other"


class ExpenseCategory(str, Enum):
    RENT = "rent"
    ELECTRICITY = "electricity"
    EQUIPMENT = "equipment"
    MAINTENANCE = "maintenance"
    CLEANING = "cleaning"
    STAFF_SALARY = "staff_salary"
    OTHER = "other"
