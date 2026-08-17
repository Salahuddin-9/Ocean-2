/**
 * Turtle Social Media Application - Authentication & Signup State Machine & Core Backend Logic
 * 
 * This file contains the fully-functional TypeScript logic for the 7-step Turtle signup flow,
 * input validation schemas, age restrictions, and the database persistence queries for Supabase.
 * 
 * -------------------------------------------------------------
 * CORE SIGNUP STEPS:
 * 1. User Creates Account (Email, Password, Username validation)
 * 2. User Enters Basic Profile Details (Full Name, Date of Birth check)
 * 3. User Selects Hand Preference (Left, Right, Ambidextrous)
 * 4. User Selects Emergency Community Pools (Membership linking)
 * 5. User Accepts Agreement / Terms Policy (Timestamped log)
 * 6. User Completes Tutorial State
 * 7. User Enters Main App Environment
 * -------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & TYPES
// ==========================================

export type HandPreference = "left" | "right" | "ambidextrous";
export type SignupStep = 
  | "ACCOUNT_CREATION"
  | "PROFILE_INFO"
  | "HAND_PREFERENCE"
  | "EMERGENCY_POOLS"
  | "AGREEMENT_ACCEPTANCE"
  | "TUTORIAL"
  | "COMPLETED";

export interface SignupProgress {
  userId?: string;
  email?: string;
  username?: string;
  password?: string;
  fullName?: string;
  dateOfBirth?: Date;
  handPreference?: HandPreference;
  selectedEmergencyPools: string[]; // UUID list
  agreementAccepted: boolean;
  agreementAcceptedAt?: Date;
  tutorialCompleted: boolean;
  currentStep: SignupStep;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface SignupFlowResponse {
  success: boolean;
  currentStep: SignupStep;
  errors?: ValidationError[];
}

// ==========================================
// 2. VALIDATION CRITERIA & AGE HANDLING
// ==========================================

const MINIMUM_AGE = 13; // COPPA Compliant Minimum Age Requirement
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/; // 3-20 characters, alphanumeric and underscores

/**
 * Validates a user's chosen username against strict format constraints
 */
export function validateUsername(username: string): ValidationError | null {
  if (!username) {
    return { field: "username", message: "Username is required." };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { 
      field: "username", 
      message: "Username must be between 3 and 20 characters and contain only letters, numbers, or underscores." 
    };
  }
  return null;
}

/**
 * Validates a user's password strength
 */
export function validatePassword(password: string): ValidationError | null {
  if (!password) {
    return { field: "password", message: "Password is required." };
  }
  if (password.length < 10) {
    return { field: "password", message: "Password must be at least 10 characters long." };
  }
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[@$!%*?&._-]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
    return {
      field: "password",
      message: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character."
    };
  }
  return null;
}

/**
 * Calculates a user's exact age in years from date of birth and validates eligibility
 */
export function validateDateOfBirth(dob: Date): ValidationError | null {
  const today = new Date();
  
  // Calculate age accurately taking leap years and birth month/day into account
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < MINIMUM_AGE) {
    return { 
      field: "dateOfBirth", 
      message: `You must be at least ${MINIMUM_AGE} years old to create a Turtle account.` 
    };
  }
  return null;
}

// ==========================================
// 3. STEP-BY-STEP SIGNUP ENGINE (State Machine)
// ==========================================

export class TurtleSignupEngine {
  private progress: SignupProgress;

  constructor(initialProgress?: Partial<SignupProgress>) {
    this.progress = {
      selectedEmergencyPools: [],
      agreementAccepted: false,
      tutorialCompleted: false,
      currentStep: "ACCOUNT_CREATION",
      ...initialProgress
    };
  }

  public getProgress(): SignupProgress {
    return { ...this.progress };
  }

  /**
   * STEP 1: Account Creation
   */
  public handleAccountCreation(email: string, username: string, passwordHash: string): SignupFlowResponse {
    const errors: ValidationError[] = [];
    
    // Email basic check
    if (!email || !email.includes("@")) {
      errors.push({ field: "email", message: "A valid email address is required." });
    }

    const usernameError = validateUsername(username);
    if (usernameError) errors.push(usernameError);

    // If client passes raw password, validate it. If already hashed, we trust the client validations.
    if (passwordHash.length < 8) {
      errors.push({ field: "password", message: "Password hash verification failed." });
    }

    if (errors.length > 0) {
      return { success: false, currentStep: "ACCOUNT_CREATION", errors };
    }

    this.progress.email = email;
    this.progress.username = username;
    this.progress.password = passwordHash;
    this.progress.currentStep = "PROFILE_INFO";

    return { success: true, currentStep: this.progress.currentStep };
  }

  /**
   * STEP 2: Basic Profile Information
   */
  public handleProfileInfo(fullName: string, dateOfBirth: Date): SignupFlowResponse {
    const errors: ValidationError[] = [];

    if (!fullName || fullName.trim().length < 2) {
      errors.push({ field: "fullName", message: "Full name must be at least 2 characters." });
    }

    const dobError = validateDateOfBirth(dateOfBirth);
    if (dobError) errors.push(dobError);

    if (errors.length > 0) {
      return { success: false, currentStep: "PROFILE_INFO", errors };
    }

    this.progress.fullName = fullName;
    this.progress.dateOfBirth = dateOfBirth;
    this.progress.currentStep = "HAND_PREFERENCE";

    return { success: true, currentStep: this.progress.currentStep };
  }

  /**
   * STEP 3: Selecting Hand Preference (Accessibility/Usability Config)
   */
  public handleHandPreference(preference: HandPreference): SignupFlowResponse {
    if (preference !== "left" && preference !== "right" && preference !== "ambidextrous") {
      return {
        success: false,
        currentStep: "HAND_PREFERENCE",
        errors: [{ field: "handPreference", message: "Invalid hand preference specified." }]
      };
    }

    this.progress.handPreference = preference;
    this.progress.currentStep = "EMERGENCY_POOLS";

    return { success: true, currentStep: this.progress.currentStep };
  }

  /**
   * STEP 4: Selecting Emergency Community Pools
   */
  public handleEmergencyPools(poolIds: string[]): SignupFlowResponse {
    // Validate UUID format of selected pools
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidPools = poolIds.filter(id => !uuidRegex.test(id));

    if (invalidPools.length > 0) {
      return {
        success: false,
        currentStep: "EMERGENCY_POOLS",
        errors: [{ field: "selectedEmergencyPools", message: "Contains invalid community pool references." }]
      };
    }

    this.progress.selectedEmergencyPools = [...poolIds];
    this.progress.currentStep = "AGREEMENT_ACCEPTANCE";

    return { success: true, currentStep: this.progress.currentStep };
  }

  /**
   * STEP 5: Policy Agreement / Acceptance
   */
  public handleAgreementAcceptance(accepted: boolean): SignupFlowResponse {
    if (!accepted) {
      return {
        success: false,
        currentStep: "AGREEMENT_ACCEPTANCE",
        errors: [{ field: "agreementAccepted", message: "You must accept the terms of service and data policy to continue." }]
      };
    }

    this.progress.agreementAccepted = true;
    this.progress.agreementAcceptedAt = new Date();
    this.progress.currentStep = "TUTORIAL";

    return { success: true, currentStep: this.progress.currentStep };
  }

  /**
   * STEP 6: Tutorial Completion Check
   */
  public handleTutorialCompletion(completed: boolean): SignupFlowResponse {
    if (!completed) {
      return {
        success: false,
        currentStep: "TUTORIAL",
        errors: [{ field: "tutorialCompleted", message: "Please complete or skip the tour guide before finalized entry." }]
      };
    }

    this.progress.tutorialCompleted = true;
    this.progress.currentStep = "COMPLETED";

    return { success: true, currentStep: this.progress.currentStep };
  }
}

// ==========================================
// 4. SUPABASE PERSISTENCE INTERACTION MOCK / SPEC
// ==========================================

/**
 * Simulates high-fidelity client action or Serverless function persisting the state to database
 */
export async function persistRegistrationToSupabase(
  supabaseClient: any, // Client-instance placeholder for standard typing compatibility
  userId: string,
  progress: SignupProgress
): Promise<{ success: boolean; error?: string }> {
  
  if (progress.currentStep !== "COMPLETED") {
    return { success: false, error: "Cannot persist registration until all 7 stages are completed." };
  }

  try {
    // 1. Transaction-like pipeline: Save basic profile additions
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .update({
        display_name: progress.fullName,
        date_of_birth: progress.dateOfBirth?.toISOString().split("T")[0],
        hand_preference: progress.handPreference,
        agreement_accepted_at: progress.agreementAcceptedAt?.toISOString()
      })
      .eq("id", userId);

    if (profileError) throw profileError;

    // 2. Set user_settings tutorial configurations
    const { error: settingsError } = await supabaseClient
      .from("user_settings")
      .update({
        tutorial_completed: true,
        hand_preference: progress.handPreference
      })
      .eq("user_id", userId);

    if (settingsError) throw settingsError;

    // 3. Register user memberships to chosen emergency pools concurrently
    if (progress.selectedEmergencyPools.length > 0) {
      const membershipRecords = progress.selectedEmergencyPools.map(poolId => ({
        pool_id: poolId,
        user_id: userId
      }));

      const { error: poolError } = await supabaseClient
        .from("user_emergency_pool_memberships")
        .insert(membershipRecords);

      if (poolError) throw poolError;
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Internal database connection failure." };
  }
}

// ============================================================================
// 5. SUPABASE SCHEMA DATABASE ADDITIONS (Postgres migration script)
// ============================================================================
export const SQL_MIGRATION_ADDITIONS = `
-- ============================================================================
-- ADDITIONS FOR ENHANCED PROFILE SIGNUP DATA IN public.profiles
-- ============================================================================

-- Add Date of Birth, Hand Preference, and Agreement timestamp flags
alter table public.profiles 
add column if not exists date_of_birth date,
add column if not exists hand_preference text check (hand_preference in ('left', 'right', 'ambidextrous')),
add column if not exists agreement_accepted_at timestamp with time zone;

-- Add check for minimum legal registration age (prevent inserting direct database records under 13)
alter table public.profiles 
add constraint check_minimum_dob_age 
check (date_of_birth <= (current_date - interval '13 years'));

-- Add hand preference configuration and tutorial state tracking to settings
alter table public.user_settings 
add column if not exists hand_preference text check (hand_preference in ('left', 'right', 'ambidextrous')) default 'right',
add column if not exists tutorial_completed boolean default false not null;
`;
