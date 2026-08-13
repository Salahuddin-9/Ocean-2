# Security Specification (TDD) for Firebase Firestore Rules

## 1. Data Invariants
- **Identity Matching**: A user document at `/users/{userId}` can only be created or updated if the authenticated user's UID (`request.auth.uid`) matches `{userId}`.
- **Uniqueness & Integrity**: Users cannot write message documents unless they are authenticated.
- **Message Sendership**: A message at `/messages/{messageId}` can only be written if the sender's authenticated UID matches the sender context of the message (in a secure client flow, though we have a proxy server, we still enforce that authenticated writes match the sender/receiver constraints or are secured appropriately).

## 2. The "Dirty Dozen" Payloads (Designed to violate security boundaries)
1. **Unauthenticated User creation**: Attempting to write to `/users/attackerId` without being logged in.
2. **Identity Spoofing**: Signed-in user `userA` attempting to write to `/users/userB`.
3. **Invalid ID formatting**: Writing to `/users/invalid_id_$%#@` with invalid ID path characters.
4. **Shadow fields insertion**: Writing extra fields like `isAdmin` to `/users/userId` during creation.
5. **PII exposure**: Attempting to read `/users/userId` private details anonymously.
6. **Unauthenticated message sending**: Attempting to insert a document to `/messages/msgId` without signing in.
7. **Message spoofing (sender Name)**: Authenticated user sending a message pretending to have another sender's name.
8. **Resource exhaustion**: Writing massive fields (>1MB payload size) to a profile.
9. **No blanket reads on users**: Trying to query all user records from the root `/users` collection without specific filters.
10. **Malicious ID injection in messages**: Creating a message with an ID containing path-traversal or special characters.
11. **Modifying core system parameters**: Modifying profile fields in a way that bypasses validation rules.
12. **Bypassing the master gate**: Attempting direct modification of another user's sub-resources.

## 3. The Rules Draft
These conditions will be completely covered and tested in our `firestore.rules` file.
