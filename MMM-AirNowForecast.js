Module.register("MMM-AirNowForecast", {
    defaults: {
        apiKey: "",
        latitude: null,
        longitude: null,
        distance: 25,
        updateInterval: 3600000,
        showForecast: true,
        showCurrent: true,
        pollutants: ["OZONE", "PM2.5", "PM10"],
        animationSpeed: 1000,
        initialLoadDelay: 0,
        retryDelay: 2500,
        maxRetries: 5,
        showLocation: true,
        roundValue: true,
        language: config.language || "en"
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
            locationDiv.className = "airnow-location light small";
            const locationData = this.currentData || this.forecastData;
            const reportingArea = locationData[0]?.reportingArea || "Unknown";
            const stateCode = locationData[0]?.stateCode || "";
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
                forecastHeader.className = "airnow-forecast-header light small";
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

        const filteredData = data.filter(item => 
            this.config.pollutants.includes(item.parameterName.toUpperCase())
        );

        if (filteredData.length === 0) {
            return null;
        }

        filteredData.forEach(item => {
            const row = document.createElement("div");
            row.className = "airnow-row";

            const pollutantSpan = document.createElement("span");
            pollutantSpan.className = "airnow-pollutant light";
            pollutantSpan.innerHTML = item.parameterName;
            row.appendChild(pollutantSpan);

            const valueSpan = document.createElement("span");
            valueSpan.className = "airnow-value bright";
            const value = item.aqi !== -1 ? item.aqi : "N/A";
            valueSpan.innerHTML = this.config.roundValue && value !== "N/A" ? 
                Math.round(value) : value;
            row.appendChild(valueSpan);

            const statusSpan = document.createElement("span");
            statusSpan.className = "airnow-status";
            const statusDot = document.createElement("span");
            statusDot.className = `airnow-dot ${this.getAQIClass(item.categoryNumber)}`;
            statusDot.innerHTML = "●";
            statusSpan.appendChild(statusDot);

            const statusText = document.createElement("span");
            statusText.className = "airnow-category light small";
            statusText.innerHTML = item.categoryName;
            statusSpan.appendChild(statusText);

            row.appendChild(statusSpan);
            container.appendChild(row);
        });

        return container;
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