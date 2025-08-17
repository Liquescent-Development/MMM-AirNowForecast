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

        // Container for relative positioning
        const container = document.createElement("div");
        container.style.position = "relative";

        // Get worst current AQI for main display
        const worstCurrent = this.getWorstPollutant(this.currentData);
        
        // Top section with AQI title and value
        const topRow = document.createElement("div");
        topRow.className = "aqi-top-row";
        
        const titleSpan = document.createElement("span");
        titleSpan.className = "aqi-title";
        titleSpan.innerHTML = `<span class="fa fa-lungs"></span> AQI`;
        topRow.appendChild(titleSpan);

        if (worstCurrent) {
            const valueSpan = document.createElement("span");
            valueSpan.className = `aqi-value ${this.getAQIClass(worstCurrent.Category?.Number)}`;
            valueSpan.innerHTML = worstCurrent.AQI || "N/A";
            topRow.appendChild(valueSpan);

            const statusSpan = document.createElement("span");
            statusSpan.className = `aqi-status ${this.getAQIClass(worstCurrent.Category?.Number)}`;
            statusSpan.innerHTML = worstCurrent.Category?.Name || "";
            topRow.appendChild(statusSpan);
        }

        container.appendChild(topRow);

        // AQI gradient bar
        const gradientContainer = document.createElement("div");
        gradientContainer.className = "aqi-gradient-container";
        
        const gradient = document.createElement("div");
        gradient.className = "aqi-gradient";
        gradientContainer.appendChild(gradient);

        if (worstCurrent && worstCurrent.AQI) {
            const marker = document.createElement("div");
            marker.className = "aqi-marker";
            // Position marker based on AQI value (0-200 scale for display)
            const position = Math.min((worstCurrent.AQI / 200) * 100, 100);
            marker.style.left = `${position}%`;
            marker.innerHTML = "▼";
            gradientContainer.appendChild(marker);
        }

        container.appendChild(gradientContainer);

        // Scale labels
        const scaleLabels = document.createElement("div");
        scaleLabels.className = "aqi-scale-labels";
        scaleLabels.innerHTML = `
            <span>0</span>
            <span>50</span>
            <span>100</span>
            <span>150</span>
            <span>200+</span>
        `;
        container.appendChild(scaleLabels);

        // Current pollutant values (horizontal)
        if (this.currentData) {
            const currentRow = document.createElement("div");
            currentRow.className = "aqi-current-row";
            
            const filteredData = this.currentData.filter(item => 
                item && item.ParameterName && this.config.pollutants.includes(item.ParameterName)
            );

            filteredData.forEach((item, index) => {
                if (index > 0) {
                    const spacer = document.createElement("span");
                    spacer.className = "aqi-spacer";
                    currentRow.appendChild(spacer);
                }

                const pollutantGroup = document.createElement("div");
                pollutantGroup.className = "aqi-pollutant-group";
                
                const value = document.createElement("div");
                value.className = `aqi-pollutant-value ${this.getAQIClass(item.Category?.Number)}`;
                value.innerHTML = item.AQI || "N/A";
                pollutantGroup.appendChild(value);

                const name = document.createElement("div");
                name.className = "aqi-pollutant-name";
                name.innerHTML = this.pollutantDisplayNames[item.ParameterName] || item.ParameterName;
                pollutantGroup.appendChild(name);

                currentRow.appendChild(pollutantGroup);
            });

            container.appendChild(currentRow);
        }

        // 5-day forecast
        if (this.config.showForecast && this.forecastData) {
            const forecastContainer = document.createElement("div");
            forecastContainer.className = "aqi-forecast-container";
            
            const forecastByDate = this.groupForecastByDate(this.forecastData);
            const dates = Object.keys(forecastByDate).sort().slice(0, 5);
            
            dates.forEach(date => {
                const dayData = forecastByDate[date];
                const worstItem = this.getWorstPollutant(dayData);
                
                if (worstItem) {
                    const dayGroup = document.createElement("div");
                    dayGroup.className = "aqi-day-group";
                    
                    const dayName = document.createElement("div");
                    dayName.className = "aqi-day-name";
                    dayName.innerHTML = this.getDayShortName(date);
                    dayGroup.appendChild(dayName);

                    const dayValue = document.createElement("div");
                    dayValue.className = `aqi-day-value ${this.getAQIClass(worstItem.Category?.Number)}`;
                    dayValue.innerHTML = worstItem.AQI || "N/A";
                    dayGroup.appendChild(dayValue);

                    forecastContainer.appendChild(dayGroup);
                }
            });

            container.appendChild(forecastContainer);
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