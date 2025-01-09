import fetch from 'node-fetch';

class ProxyCheckService {
    constructor(config) {
        this.baseURL = 'https://proxycheck.io/v2';
        this.apiKey = config.proxyCheckApiKey;
        this.enabled = config.enableProxyCheck;
        this.cache = new Map();
        this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.pendingRequests = new Map(); // Track in-flight requests
    }

    setApiKey(key) {
        this.apiKey = key;
        this.clearCache();
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    clearCache() {
        this.cache.clear();
        this.pendingRequests.clear();
    }

    async fetchIpDetails(ip) {
        // Return null if service is disabled
        if (!this.enabled) {
            return null;
        }

        // Check cache first
        const cached = this.cache.get(ip);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
            return cached.data;
        }

        // Check if there's already a pending request for this IP
        if (this.pendingRequests.has(ip)) {
            return this.pendingRequests.get(ip);
        }

        // Create new request promise
        const requestPromise = (async () => {
            try {
                const url = `${this.baseURL}/${ip}?vpn=1&asn=1${this.apiKey ? `&key=${this.apiKey}` : ''}`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.status === 'ok' && data[ip]) {
                    // Cache the result
                    this.cache.set(ip, {
                        timestamp: Date.now(),
                        data: data[ip]
                    });
                    return data[ip];
                }
                return null;
            } catch (error) {
                console.error('Error fetching IP details:', error);
                return null;
            } finally {
                // Remove from pending requests
                this.pendingRequests.delete(ip);
            }
        })();

        // Store the pending request
        this.pendingRequests.set(ip, requestPromise);
        return requestPromise;
    }

    // Enrich connection data with IP details
    async enrichConnections(connections) {
        if (!this.enabled) {
            return connections;
        }

        // Create a Set of unique IPs to check
        const uniqueIps = new Set(connections.map(conn => conn.ip));
        
        // Fetch details for all unique IPs in parallel
        const ipDetailsMap = new Map();
        await Promise.all(
            Array.from(uniqueIps).map(async ip => {
                const details = await this.fetchIpDetails(ip);
                if (details) {
                    ipDetailsMap.set(ip, details);
                }
            })
        );

        // Enrich connections with IP details
        return connections.map(conn => {
            const ipDetails = ipDetailsMap.get(conn.ip);
            if (ipDetails) {
                return {
                    ...conn,
                    ipInfo: ipDetails
                };
            }
            return conn;
        });
    }
}

export default ProxyCheckService; 