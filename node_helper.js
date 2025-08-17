const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const Log = require("logger");

module.exports = NodeHelper.create({
    start: function() {
        Log.log("Starting node helper for: " + this.name);
        this.cache = {
            current: null,
            forecast: null,
            lastUpdate: null
        };
        this.config = null;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CONFIG") {
            this.config = payload;
        } else if (notification === "GET_AIR_DATA") {
            this.fetchAirData(payload);
        }
    },

    fetchAirData: function(config) {
        const now = Date.now();
        const cacheAge = now - this.cache.lastUpdate;
        
        if (this.cache.lastUpdate && cacheAge < 600000) {
            Log.log(this.name + ": Using cached data (age: " + Math.round(cacheAge/1000) + "s)");
            this.sendSocketNotification("AIR_DATA", {
                current: this.cache.current,
                forecast: this.cache.forecast
            });
            return;
        }

        const promises = [];

        if (config.showCurrent) {
            promises.push(this.fetchCurrentObservation(config));
        }

        if (config.showForecast) {
            promises.push(this.fetchForecast(config));
        }

        Promise.all(promises)
            .then(results => {
                const data = {};
                
                if (config.showCurrent && results[0]) {
                    this.cache.current = results[0];
                    data.current = results[0];
                }
                
                if (config.showForecast) {
                    const forecastIndex = config.showCurrent ? 1 : 0;
                    if (results[forecastIndex]) {
                        this.cache.forecast = results[forecastIndex];
                        data.forecast = results[forecastIndex];
                    }
                }

                this.cache.lastUpdate = now;
                this.sendSocketNotification("AIR_DATA", data);
            })
            .catch(error => {
                Log.error(this.name + ": Error fetching air data: " + error.message);
                this.sendSocketNotification("AIR_ERROR", {
                    message: error.message
                });
            });
    },

    fetchCurrentObservation: function(config) {
        const url = this.buildUrl(
            "https://www.airnowapi.org/aq/observation/latLong/current",
            {
                latitude: config.latitude,
                longitude: config.longitude,
                distance: config.distance,
                format: "application/json",
                api_key: config.apiKey
            }
        );

        Log.log(this.name + ": Fetching current observation from: " + url);
        
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    Log.error(this.name + ": HTTP error! status: " + response.status);
                    if (response.status === 401) {
                        throw new Error("Invalid API key - please check your AirNow API key");
                    } else if (response.status === 429) {
                        throw new Error("Rate limit exceeded - too many requests");
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!Array.isArray(data)) {
                    Log.error(this.name + ": Invalid response format - not an array");
                    Log.error(this.name + ": Response data: " + JSON.stringify(data));
                    throw new Error("Invalid response format from AirNow API");
                }
                Log.log(this.name + ": Current observation data received: " + data.length + " items");
                // Log first item structure for debugging
                if (data.length > 0) {
                    Log.log(this.name + ": Sample item: " + JSON.stringify(data[0]));
                }
                return data;
            })
            .catch(error => {
                Log.error(this.name + ": Error fetching current observation: " + error.message);
                if (this.cache.current) {
                    Log.log(this.name + ": Using stale cached current data");
                    return this.cache.current;
                }
                throw error;
            });
    },

    fetchForecast: function(config) {
        const url = this.buildUrl(
            "https://www.airnowapi.org/aq/forecast/latLong/",
            {
                latitude: config.latitude,
                longitude: config.longitude,
                distance: config.distance,
                format: "application/json",
                api_key: config.apiKey
            }
        );

        Log.log(this.name + ": Fetching forecast from: " + url);
        
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    Log.error(this.name + ": HTTP error! status: " + response.status);
                    if (response.status === 401) {
                        throw new Error("Invalid API key - please check your AirNow API key");
                    } else if (response.status === 429) {
                        throw new Error("Rate limit exceeded - too many requests");
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!Array.isArray(data)) {
                    Log.error(this.name + ": Invalid forecast format - not an array");
                    Log.error(this.name + ": Response data: " + JSON.stringify(data));
                    throw new Error("Invalid response format from AirNow API");
                }
                
                Log.log(this.name + ": Forecast data received: " + data.length + " items");
                // Log first item structure for debugging
                if (data.length > 0) {
                    Log.log(this.name + ": Sample forecast item: " + JSON.stringify(data[0]));
                }
                
                // Return all forecast data, let the display logic handle filtering
                return data;
            })
            .catch(error => {
                Log.error(this.name + ": Error fetching forecast: " + error.message);
                if (this.cache.forecast) {
                    Log.log(this.name + ": Using stale cached forecast data");
                    return this.cache.forecast;
                }
                throw error;
            });
    },

    buildUrl: function(baseUrl, params) {
        const url = new URL(baseUrl);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });
        return url.toString();
    }
});