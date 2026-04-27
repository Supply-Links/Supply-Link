# API Error Handling & Correlation IDs

## Error Envelope

Every error response from the API follows this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Stars must be an integer between 1 and 5",
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

The same `correlationId` is also present in the `X-Correlation-Id` response header.

## Error Code Catalog

| Code                     | HTTP Status | Meaning                                        |
| ------------------------ | ----------- | ---------------------------------------------- |
| `VALIDATION_ERROR`       | 400         | Input failed validation rules                  |
| `MISSING_FIELDS`         | 400         | Required fields absent from request            |
| `INVALID_PAYLOAD`        | 400         | Payload is structurally invalid (e.g. bad XDR) |
| `UNAUTHORIZED`           | 401         | Authentication required                        |
| `INVALID_SIGNATURE`      | 401         | Stellar signature verification failed          |
| `IDEMPOTENCY_CONFLICT`   | 409         | Idempotency key reused with different payload  |
| `RATE_LIMITED`           | 429         | Too many requests; see `Retry-After` header    |
| `INTERNAL_ERROR`         | 500         | Unexpected server error                        |
| `DEPENDENCY_UNAVAILABLE` | 500         | Required external dependency not configured    |

## Correlation ID Propagation

- **Client-supplied:** Send `X-Correlation-Id: <your-id>` or `X-Request-Id: <your-id>` on any request. The same value is echoed back in the response header and error body.
- **Server-generated:** When no header is present, the server generates a UUID v4 and attaches it to the response.

## Troubleshooting Flow

1. **Capture the correlation ID** from the `X-Correlation-Id` response header or the `error.correlationId` field.
2. **Filter logs** by that ID:
   ```
   grep "correlationId" /var/log/app.log | grep "<your-id>"
   ```
   Or in Vercel/cloud log explorer, search for the UUID string.
3. **Trace the request path:** logs for validation, external calls (Stellar RPC, KV store), and the final response all share the same ID.
4. **Escalate:** If the error code is `INTERNAL_ERROR` or `DEPENDENCY_UNAVAILABLE`, check dependency health via `GET /api/health` and review server-side logs for the full stack trace (never exposed to clients).
