import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '5s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const url = __ENV.API_BASE_URL || 'http://localhost:5000/api/v1';
  
  // Safe mock checkout validation request (invalid cart payload to test validation response safely)
  const payload = JSON.stringify({
    items: [],
    paymentType: 'cash',
  });
  
  const res = http.post(`${url}/pos/transactions`, payload, {
    headers: { 
      'Content-Type': 'application/json',
      'x-company-token': 'token-tenant-a'
    },
  });
  
  check(res, {
    'status is 400 (validation check) or 401': (r) => r.status === 400 || r.status === 401,
  });
  
  sleep(2);
}
