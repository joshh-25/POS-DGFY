import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 3, // Safe low-load VUs
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // less than 1% errors
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
  },
};

// This probe intentionally exercises the not-found contract. Tell k6 that
// HTTP 404 is the expected transport result; the check below still validates
// the exact response body and prevents arbitrary 404s from passing.
http.setResponseCallback(http.expectedStatuses(404));

export default function () {
  const apiBaseUrl = (__ENV.API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
  const lookupEmail = __ENV.TEST_LOOKUP_EMAIL
    || `system-load-probe-${__VU}-${__ITER}-${Date.now()}@example.invalid`;

  const res = http.post(`${apiBaseUrl}/api/v1/auth/lookup`, JSON.stringify({
    email: lookupEmail
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(res, {
    'lookup endpoint returns expected not-found contract': (r) => {
      if (r.status !== 404) return false;
      try {
        const body = r.json();
        return body?.success === false
          && body?.data === null
          && body?.message === 'Email not registered in any company';
      } catch {
        return false;
      }
    },
  });
  
  sleep(1);
}
