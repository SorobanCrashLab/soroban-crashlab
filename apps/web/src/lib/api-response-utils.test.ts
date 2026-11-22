import { describe, it, expect } from 'vitest';
import {
  successResponse,
  errorResponse,
  createdResponse,
  status,
  type ApiSuccessResponse,
  type ApiErrorResponse,
} from './api-response-utils';

describe('API Response Utilities', () => {
  describe('successResponse', () => {
    it('returns 200 status with data by default', () => {
      const data = { id: '123', name: 'Test' };
      const response = successResponse(data);

      expect(response.status).toBe(200);
    });

    it('includes data in response body', async () => {
      const data = { id: '123', name: 'Test' };
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toEqual(data);
    });

    it('includes total when provided', async () => {
      const data = [{ id: '1' }, { id: '2' }];
      const response = successResponse(data, { total: 10 });
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.total).toBe(10);
    });

    it('omits total when not provided', async () => {
      const data = { id: '123' };
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body).not.toHaveProperty('total');
    });

    it('uses custom status when provided', () => {
      const response = successResponse({ data: 'test' }, { status: 202 });
      expect(response.status).toBe(202);
    });

    it('respects status over default 200', () => {
      const response = successResponse({ id: '1' }, { status: 202, total: 1 });
      expect(response.status).toBe(202);
    });

    it('handles empty arrays', async () => {
      const data: unknown[] = [];
      const response = successResponse(data, { total: 0 });
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('handles null data gracefully', async () => {
      const data = null;
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toBeNull();
    });

    it('handles deeply nested objects', async () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data.level1.level2.level3.value).toBe('deep');
    });
  });

  describe('errorResponse', () => {
    it('returns error with default 500 status', () => {
      const response = errorResponse('Something went wrong');
      expect(response.status).toBe(500);
    });

    it('includes error message in response body', async () => {
      const response = errorResponse('Invalid request');
      const body: ApiErrorResponse = await response.json();

      expect(body.error).toBe('Invalid request');
    });

    it('uses custom status code', () => {
      const response = errorResponse('Not found', 404);
      expect(response.status).toBe(404);
    });

    it('handles all HTTP error codes', async () => {
      const testCases = [
        { status: 400, error: 'Bad Request' },
        { status: 401, error: 'Unauthorized' },
        { status: 403, error: 'Forbidden' },
        { status: 404, error: 'Not Found' },
        { status: 409, error: 'Conflict' },
        { status: 422, error: 'Unprocessable Entity' },
        { status: 500, error: 'Internal Server Error' },
        { status: 502, error: 'Bad Gateway' },
        { status: 503, error: 'Service Unavailable' },
      ];

      for (const { status: code, error } of testCases) {
        const response = errorResponse(error, code);
        expect(response.status).toBe(code);
        const body = (await response.json()) as ApiErrorResponse;
        expect(body.error).toBe(error);
      }
    });

    it('handles long error messages', async () => {
      const longError = 'A'.repeat(1000);
      const response = errorResponse(longError);
      const body: ApiErrorResponse = await response.json();

      expect(body.error).toBe(longError);
      expect(body.error).toHaveLength(1000);
    });

    it('handles special characters in error message', async () => {
      const error = 'Error: "quotes", \'apostrophes\', & special chars!';
      const response = errorResponse(error);
      const body: ApiErrorResponse = await response.json();

      expect(body.error).toBe(error);
    });

    it('handles Unicode characters in error message', async () => {
      const error = 'エラー: 测试 🚀';
      const response = errorResponse(error);
      const body: ApiErrorResponse = await response.json();

      expect(body.error).toBe(error);
    });
  });

  describe('createdResponse', () => {
    it('returns 201 status', () => {
      const response = createdResponse({ id: '123' });
      expect(response.status).toBe(201);
    });

    it('includes data in response body', async () => {
      const data = { id: '123', created: true };
      const response = createdResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toEqual(data);
    });

    it('does not include total in response', async () => {
      const response = createdResponse({ id: '123' });
      const body = (await response.json()) as Record<string, unknown>;

      expect(body).not.toHaveProperty('total');
    });

    it('handles complex created resources', async () => {
      const data = {
        id: 'run-123',
        name: 'Test Run',
        status: 'created',
        metadata: { tags: ['tag1', 'tag2'] },
      };
      const response = createdResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toEqual(data);
      expect(response.status).toBe(201);
    });
  });

  describe('status constants', () => {
    it('has correct HTTP status code for ok', () => {
      expect(status.ok).toBe(200);
    });

    it('has correct HTTP status code for created', () => {
      expect(status.created).toBe(201);
    });

    it('has correct HTTP status codes for client errors', () => {
      expect(status.badRequest).toBe(400);
      expect(status.unauthorized).toBe(401);
      expect(status.forbidden).toBe(403);
      expect(status.notFound).toBe(404);
      expect(status.unprocessableEntity).toBe(422);
      expect(status.conflict).toBe(409);
    });

    it('has correct HTTP status codes for server errors', () => {
      expect(status.internalError).toBe(500);
      expect(status.badGateway).toBe(502);
      expect(status.serviceUnavailable).toBe(503);
    });

    it('exports correct status code mappings', () => {
      const allStatuses = Object.values(status);
      expect(allStatuses).toContain(200);
      expect(allStatuses).toContain(201);
      expect(allStatuses).toContain(400);
      expect(allStatuses).toContain(404);
      expect(allStatuses).toContain(500);
    });
  });

  describe('edge cases', () => {
    it('handles response with empty string data', async () => {
      const response = successResponse('');
      const body: ApiSuccessResponse<string> = await response.json();

      expect(body.data).toBe('');
    });

    it('handles response with zero data', async () => {
      const response = successResponse(0);
      const body: ApiSuccessResponse<number> = await response.json();

      expect(body.data).toBe(0);
    });

    it('handles response with false data', async () => {
      const response = successResponse(false);
      const body: ApiSuccessResponse<boolean> = await response.json();

      expect(body.data).toBe(false);
    });

    it('handles response with undefined in total', async () => {
      const data = { id: '123' };
      const response = successResponse(data, { total: undefined });
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body).not.toHaveProperty('total');
    });

    it('handles mixed types in data arrays', async () => {
      const data = [1, 'string', { obj: true }, null];
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toEqual([1, 'string', { obj: true }, null]);
    });

    it('handles circular reference prevention by JSON serialization', async () => {
      const data = { id: '123', value: 'test' };
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data).toEqual(data);
    });

    it('preserves data type for dates serialized as strings', async () => {
      const dateString = new Date('2024-01-01T00:00:00Z').toISOString();
      const data = { createdAt: dateString };
      const response = successResponse(data);
      const body: ApiSuccessResponse<typeof data> = await response.json();

      expect(body.data.createdAt).toBe(dateString);
    });
  });
});
