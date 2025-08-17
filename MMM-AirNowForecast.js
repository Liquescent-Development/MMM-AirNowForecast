Module.register("MMM-AirNowForecast", {
    defaults: {
        apiKey: "",
        latitude: null,
        longitude: null,
        distance: 25,
        updateInterval: 3600000,
        showForecast: true,
        showCurrent: true,
        pollutants: ["O3", "PM2.5", "PM10"],  // Use API parameter names
        animationSpeed: 1000,
        initialLoadDelay: 0,
        retryDelay: 2500,
        maxRetries: 5,
        showLocation: true,
        roundValue: true,
        language: config.language || "en"
    },

    // Map API parameter names to display names
    pollutantDisplayNames: {
        "O3": "OZONE",
        "PM2.5": "PM2.5",
        "PM10": "PM10",
        "CO": "CO",
        "NO2": "NO2",
        "SO2": "SO2"
    },

    currentData: null,
    forecastData: null,
    identifier: null,
    timer: null,
    retryCount: 0,
    loaded: false,

    start: function() {
        Log.info("Starting module: " + this.name);
        this.loaded = false;
        this.currentData = null;
        this.forecastData = null;
        this.retryCount = 0;

        if (!this.config.apiKey) {
            Log.error(this.name + ": API key is required");
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
            return;
        }

        if (!this.config.latitude || !this.config.longitude) {
            Log.error(this.name + ": Latitude and longitude are required");
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
            return;
        }

        this.sendSocketNotification("CONFIG", this.config);
        
        const self = this;
        setTimeout(function() {
            self.sendSocketNotification("GET_AIR_DATA", self.config);
        }, this.config.initialLoadDelay);

        this.scheduleUpdate();
    },

    scheduleUpdate: function() {
        const self = this;
        
        this.timer = setInterval(function() {
            self.sendSocketNotification("GET_AIR_DATA", self.config);
        }, this.config.updateInterval);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "AIR_DATA") {
            this.retryCount = 0;
            this.processAirData(payload);
        } else if (notification === "AIR_ERROR") {
            this.processError(payload);
        }
    },

    processAirData: function(data) {
        this.loaded = true;
        
        if (data.current) {
            this.currentData = data.current;
        }
        
        if (data.forecast) {
            this.forecastData = data.forecast;
        }

        this.updateDom(this.config.animationSpeed);
    },

    processError: function(error) {
        Log.error(this.name + ": " + error.message);
        
        if (this.retryCount < this.config.maxRetries) {
            this.retryCount++;
            const self = this;
            setTimeout(function() {
                self.sendSocketNotification("GET_AIR_DATA", self.config);
            }, this.config.retryDelay * this.retryCount);
        } else {
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
        }
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "mmm-airnow-wrapper";

        if (!this.config.apiKey) {
            wrapper.innerHTML = "Please set your AirNow API key";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.config.latitude || !this.config.longitude) {
            wrapper.innerHTML = "Please set latitude and longitude";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = "Loading air quality data...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.currentData && !this.forecastData) {
            wrapper.innerHTML = "No air quality data available";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.showLocation && (this.currentData || this.forecastData)) {
            const locationDiv = document.createElement("div");
            locationDiv.className = "airnow-location";
            const locationData = this.currentData || this.forecastData;
            const reportingArea = locationData[0]?.ReportingArea || "Unknown";
            const stateCode = locationData[0]?.StateCode || "";
            locationDiv.innerHTML = `<span class="fa fa-map-marker"></span> ${reportingArea}${stateCode ? ", " + stateCode : ""}`;
            wrapper.appendChild(locationDiv);
        }

        if (this.config.showCurrent && this.currentData) {
            const currentDiv = this.createDataDisplay(this.currentData, "current");
            if (currentDiv) {
                wrapper.appendChild(currentDiv);
            }
        }

        if (this.config.showForecast && this.forecastData) {
            if (this.config.showCurrent && this.currentData) {
                const separator = document.createElement("div");
                separator.className = "airnow-separator";
                wrapper.appendChild(separator);
            }

            const forecastDiv = this.createDataDisplay(this.forecastData, "forecast");
            if (forecastDiv) {
                const forecastHeader = document.createElement("div");
                forecastHeader.className = "airnow-forecast-header";
                forecastHeader.innerHTML = "Forecast";
                wrapper.appendChild(forecastHeader);
                wrapper.appendChild(forecastDiv);
            }
        }

        return wrapper;
    },

    createDataDisplay: function(data, type) {
        const container = document.createElement("div");
        container.className = `airnow-${type}`;

        // Validate data is an array and filter valid items
        if (!Array.isArray(data)) {
            Log.error(this.name + ": Invalid data format - expected array");
            return null;
        }

        if (type === "forecast") {
            // For forecast, group by date and show worst pollutant
            return this.createForecastDisplay(data);
        }

        // For current data, show all pollutants
        const filteredData = data.filter(item => {
            // Check if item has required properties
            if (!item || !item.ParameterName) {
                Log.warn(this.name + ": Skipping item with missing ParameterName");
                return false;
            }
            // Check if this pollutant is in our configured list
            return this.config.pollutants.includes(item.ParameterName);
        });

        if (filteredData.length === 0) {
            return null;
        }

        filteredData.forEach(item => {
            const row = document.createElement("div");
            row.className = "airnow-row";

            const pollutantSpan = document.createElement("span");
            pollutantSpan.className = "airnow-pollutant";
            // Use display name if available, otherwise use the API parameter name
            const displayName = this.pollutantDisplayNames[item.ParameterName] || item.ParameterName || "Unknown";
            pollutantSpan.innerHTML = displayName;
            row.appendChild(pollutantSpan);

            const valueSpan = document.createElement("span");
            valueSpan.className = "airnow-value bright";
            const value = (item.AQI !== undefined && item.AQI !== -1) ? item.AQI : "N/A";
            valueSpan.innerHTML = this.config.roundValue && value !== "N/A" ? 
                Math.round(value) : value;
            row.appendChild(valueSpan);

            const statusSpan = document.createElement("span");
            statusSpan.className = "airnow-status";
            const statusDot = document.createElement("span");
            const categoryNumber = item.Category?.Number;
            statusDot.className = `airnow-dot ${this.getAQIClass(categoryNumber)}`;
            statusDot.innerHTML = "●";
            statusSpan.appendChild(statusDot);

            const statusText = document.createElement("span");
            statusText.className = "airnow-category";
            const categoryName = item.Category?.Name || "";
            statusText.innerHTML = categoryName;
            statusSpan.appendChild(statusText);

            row.appendChild(statusSpan);
            container.appendChild(row);
        });

        return container;
    },

    createForecastDisplay: function(data) {
        const container = document.createElement("div");
        container.className = "airnow-forecast";

        // Group forecast data by date
        const forecastByDate = {};
        
        data.forEach(item => {
            if (!item || !item.DateForecast || !item.ParameterName) return;
            if (!this.config.pollutants.includes(item.ParameterName)) return;
            
            const date = item.DateForecast;
            if (!forecastByDate[date]) {
                forecastByDate[date] = [];
            }
            forecastByDate[date].push(item);
        });

        // Get sorted dates (today and next few days)
        const dates = Object.keys(forecastByDate).sort();
        const today = new Date().toISOString().split('T')[0];
        
        // Show up to 3 days of forecast
        dates.slice(0, 3).forEach(date => {
            const dayData = forecastByDate[date];
            
            // Find the worst (highest AQI) pollutant for this day
            let worstItem = dayData.reduce((worst, item) => {
                const aqi = item.AQI !== undefined && item.AQI !== -1 ? item.AQI : 0;
                const worstAqi = worst.AQI !== undefined && worst.AQI !== -1 ? worst.AQI : 0;
                return aqi > worstAqi ? item : worst;
            }, dayData[0]);

            const row = document.createElement("div");
            row.className = "airnow-row";

            // Add day label
            const daySpan = document.createElement("span");
            daySpan.className = "airnow-forecast-day";
            const dayName = this.getDayName(date, today);
            daySpan.innerHTML = dayName;
            row.appendChild(daySpan);

            const pollutantSpan = document.createElement("span");
            pollutantSpan.className = "airnow-pollutant";
            const displayName = this.pollutantDisplayNames[worstItem.ParameterName] || worstItem.ParameterName;
            pollutantSpan.innerHTML = displayName;
            row.appendChild(pollutantSpan);

            const valueSpan = document.createElement("span");
            valueSpan.className = "airnow-value bright";
            const value = (worstItem.AQI !== undefined && worstItem.AQI !== -1) ? worstItem.AQI : "N/A";
            valueSpan.innerHTML = this.config.roundValue && value !== "N/A" ? 
                Math.round(value) : value;
            row.appendChild(valueSpan);

            const statusSpan = document.createElement("span");
            statusSpan.className = "airnow-status";
            const statusDot = document.createElement("span");
            const categoryNumber = worstItem.Category?.Number;
            statusDot.className = `airnow-dot ${this.getAQIClass(categoryNumber)}`;
            statusDot.innerHTML = "●";
            statusSpan.appendChild(statusDot);

            const statusText = document.createElement("span");
            statusText.className = "airnow-category";
            const categoryName = worstItem.Category?.Name || "";
            statusText.innerHTML = categoryName;
            statusSpan.appendChild(statusText);

            row.appendChild(statusSpan);
            container.appendChild(row);
        });

        return container.children.length > 0 ? container : null;
    },

    getDayName: function(dateStr, todayStr) {
        if (dateStr === todayStr) return "Today";
        
        const date = new Date(dateStr + 'T12:00:00');
        const today = new Date(todayStr + 'T12:00:00');
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (date.toISOString().split('T')[0] === tomorrow.toISOString().split('T')[0]) {
            return "Tmrw";
        }
        
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[date.getDay()];
    },

    getAQIClass: function(categoryNumber) {
        switch(categoryNumber) {
            case 1: return "aqi-good";
            case 2: return "aqi-moderate";
            case 3: return "aqi-usg";
            case 4: return "aqi-unhealthy";
            case 5: return "aqi-very-unhealthy";
            case 6: return "aqi-hazardous";
            default: return "aqi-unavailable";
        }
    },

    getStyles: function() {
        return ["MMM-AirNowForecast.css"];
    },

    getScripts: function() {
        return [];
    },

    suspend: function() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },

    resume: function() {
        if (!this.timer) {
            this.scheduleUpdate();
        }
    }
});