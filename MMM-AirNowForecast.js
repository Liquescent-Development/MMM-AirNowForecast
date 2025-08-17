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
        wrapper.className = "aqi-wrapper";

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

        // Container for relative positioning (for location)
        const container = document.createElement("div");
        container.style.position = "relative";
        container.style.width = "100%";

        // Get worst current AQI for main display
        const worstCurrent = this.getWorstPollutant(this.currentData);
        
        // Top section with icon, label, value and status - centered like UV Index
        const currentDiv = document.createElement("div");
        currentDiv.className = "aqi-current";
        
        const icon = document.createElement("span");
        icon.className = "aqi-icon fa fa-lungs";
        currentDiv.appendChild(icon);

        const label = document.createElement("span");
        label.className = "aqi-label";
        label.innerHTML = "AQI";
        currentDiv.appendChild(label);

        if (worstCurrent) {
            const value = document.createElement("span");
            value.className = `aqi-value ${this.getAQIClass(worstCurrent.Category?.Number)}`;
            value.innerHTML = worstCurrent.AQI || "N/A";
            currentDiv.appendChild(value);

            const status = document.createElement("span");
            status.className = `aqi-status ${this.getAQIClass(worstCurrent.Category?.Number)}`;
            status.innerHTML = worstCurrent.Category?.Name || "";
            currentDiv.appendChild(status);
        }

        container.appendChild(currentDiv);

        // AQI spectrum bar (like UV spectrum bar)
        const spectrumContainer = document.createElement("div");
        spectrumContainer.className = "aqi-spectrum-container";
        
        const spectrumBar = document.createElement("div");
        spectrumBar.className = "aqi-spectrum-bar";
        spectrumContainer.appendChild(spectrumBar);

        if (worstCurrent && worstCurrent.AQI) {
            const indicator = document.createElement("div");
            indicator.className = "aqi-spectrum-indicator";
            // Position based on AQI value (0-200 scale)
            const position = Math.min((worstCurrent.AQI / 200) * 100, 100);
            indicator.style.left = `${position}%`;
            spectrumContainer.appendChild(indicator);
        }

        container.appendChild(spectrumContainer);

        // Scale labels
        const labels = document.createElement("div");
        labels.className = "aqi-spectrum-labels";
        labels.innerHTML = `
            <span>0</span>
            <span>50</span>
            <span>100</span>
            <span>150</span>
            <span>200+</span>
        `;
        container.appendChild(labels);

        // Current pollutants (horizontal like UV hourly)
        if (this.currentData) {
            const pollutantsDiv = document.createElement("div");
            pollutantsDiv.className = "aqi-pollutants";
            
            const filteredData = this.currentData.filter(item => 
                item && item.ParameterName && this.config.pollutants.includes(item.ParameterName)
            );

            filteredData.forEach(item => {
                const pollutantItem = document.createElement("div");
                pollutantItem.className = "aqi-pollutant-item";
                
                const value = document.createElement("div");
                value.className = `aqi-pollutant-value ${this.getAQIClass(item.Category?.Number)}`;
                value.innerHTML = item.AQI || "N/A";
                pollutantItem.appendChild(value);

                const name = document.createElement("div");
                name.className = "aqi-pollutant-name";
                name.innerHTML = this.pollutantDisplayNames[item.ParameterName] || item.ParameterName;
                pollutantItem.appendChild(name);

                pollutantsDiv.appendChild(pollutantItem);
            });

            container.appendChild(pollutantsDiv);
        }

        // 5-day forecast (like UV daily forecast)
        if (this.config.showForecast && this.forecastData) {
            const forecastDiv = document.createElement("div");
            forecastDiv.className = "aqi-forecast";
            
            const forecastByDate = this.groupForecastByDate(this.forecastData);
            const dates = Object.keys(forecastByDate).sort().slice(0, 5);
            
            dates.forEach(date => {
                const dayData = forecastByDate[date];
                const worstItem = this.getWorstPollutant(dayData);
                
                if (worstItem) {
                    const dayDiv = document.createElement("div");
                    dayDiv.className = "aqi-forecast-day";
                    
                    const label = document.createElement("div");
                    label.className = "aqi-forecast-label";
                    label.innerHTML = this.getDayShortName(date);
                    dayDiv.appendChild(label);

                    const value = document.createElement("div");
                    value.className = `aqi-forecast-value ${this.getAQIClass(worstItem.Category?.Number)}`;
                    value.innerHTML = worstItem.AQI || "N/A";
                    dayDiv.appendChild(value);

                    forecastDiv.appendChild(dayDiv);
                }
            });

            container.appendChild(forecastDiv);
        }

        // Location (positioned absolutely in top-right)
        if (this.config.showLocation && (this.currentData || this.forecastData)) {
            const locationDiv = document.createElement("div");
            locationDiv.className = "aqi-location";
            const locationData = this.currentData || this.forecastData;
            const reportingArea = locationData[0]?.ReportingArea || "Unknown";
            const stateCode = locationData[0]?.StateCode || "";
            locationDiv.innerHTML = `<span class="fa fa-map-marker"></span> ${reportingArea}, ${stateCode}`;
            container.appendChild(locationDiv);
        }

        wrapper.appendChild(container);
        return wrapper;
    },

    getWorstPollutant: function(data) {
        if (!data || !Array.isArray(data)) return null;
        
        const filtered = data.filter(item => 
            item && item.ParameterName && this.config.pollutants.includes(item.ParameterName)
        );
        
        if (filtered.length === 0) return null;
        
        return filtered.reduce((worst, item) => {
            const aqi = item.AQI !== undefined && item.AQI !== -1 ? item.AQI : 0;
            const worstAqi = worst.AQI !== undefined && worst.AQI !== -1 ? worst.AQI : 0;
            return aqi > worstAqi ? item : worst;
        }, filtered[0]);
    },

    groupForecastByDate: function(data) {
        const grouped = {};
        
        data.forEach(item => {
            if (!item || !item.DateForecast || !item.ParameterName) return;
            if (!this.config.pollutants.includes(item.ParameterName)) return;
            
            const date = item.DateForecast;
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(item);
        });
        
        return grouped;
    },

    getDayShortName: function(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
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