// AnnexLK Premium Vanilla HTTP Fetch Client with Silent Token Refresh Interceptor
import CONFIG from '../config.js';
import Session from '../state/session.js';

let isRefreshing = false;
let refreshQueue = [];

function processQueue(error, token = null) {
  refreshQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  refreshQueue = [];
}

/**
 * Standard HTTP client.
 */
async function client(endpoint, { body, ...customConfig } = {}) {
  const token = Session.getToken();
  
  const headers = {
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Handle body payloads
  let isMultipart = body instanceof FormData;
  if (body && !isMultipart) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method: body ? 'POST' : 'GET',
    ...customConfig,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
    // Enforce credentials sharing to allow cookies transmission (essential for HTTP-only refresh tokens)
    credentials: 'include', 
  };

  if (body) {
    config.body = isMultipart ? body : JSON.stringify(body);
  }

  const url = `${CONFIG.API_BASE_URL}/${endpoint.replace(/^\//, '')}`;

  try {
    const response = await fetch(url, config);

    // 1. Silent token refresh interceptor if token expired (401 Unauthorized)
    if (response.status === 401 && token) {
      if (isRefreshing) {
        // Queue this request wait until token is refreshed
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve: (newToken) => {
            config.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(fetch(url, config).then(handleResponse));
          }, reject });
        });
      }

      isRefreshing = true;
      
      try {
        // Trigger token rotation endpoint
        const refreshRes = await fetch(`${CONFIG.API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        
        const refreshData = await refreshRes.json();
        
        if (refreshRes.ok && refreshData.success) {
          const newAccessToken = refreshData.data.accessToken;
          const user = Session.getUser();
          Session.save(user, newAccessToken);
          
          isRefreshing = false;
          processQueue(null, newAccessToken);
          
          // Re-try original request with new token
          config.headers['Authorization'] = `Bearer ${newAccessToken}`;
          const retryRes = await fetch(url, config);
          return await handleResponse(retryRes);
        } else {
          // Refresh failed
          isRefreshing = false;
          processQueue(new Error('Session expired'));
          Session.clear();
          // Redirect to login if user was logged in
          if (window.location.pathname !== '/pages/login.html' && window.location.pathname !== '/pages/register.html') {
            window.location.href = '/pages/login.html?expired=true';
          }
          throw new Error('Session expired. Please log in again.');
        }
      } catch (err) {
        isRefreshing = false;
        processQueue(err);
        throw err;
      }
    }

    return await handleResponse(response);
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Handle HTTP responses and parse standard API formats.
 */
async function handleResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    data = { success: false, message: 'Invalid server response' };
  }

  if (response.ok) {
    return data;
  } else {
    // Custom error format compatibility mapping
    const error = new Error(data.message || response.statusText);
    error.status = response.status;
    error.errors = data.errors || [];
    throw error;
  }
}

// HTTP helper shortcuts
client.get = (endpoint, config) => client(endpoint, { ...config, method: 'GET' });
client.post = (endpoint, body, config) => client(endpoint, { ...config, body, method: 'POST' });
client.put = (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PUT' });
client.patch = (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PATCH' });
client.delete = (endpoint, config) => client(endpoint, { ...config, method: 'DELETE' });

export default client;
