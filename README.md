# MMM-AirNowForecast

A [MagicMirror²](https://magicmirror.builders/) module that displays real-time air quality information from [AirNow.gov](https://www.airnow.gov/).

## Features

- Display current air quality index (AQI) for multiple pollutants
- Show air quality forecasts
- Color-coded indicators based on AQI categories
- Configurable pollutant display (Ozone, PM2.5, PM10)
- Location-based reporting with city/state display
- Automatic data caching to respect API rate limits
- Clean, minimal design that matches other MM modules

## Installation

1. Navigate to your MagicMirror's `modules` folder:
```bash
cd ~/MagicMirror/modules/
```

2. Clone this repository:
```bash
git clone https://github.com/Liquescent-Development/MMM-AirNowForecast.git
```

3. Navigate to the module folder and install dependencies:
```bash
cd MMM-AirNowForecast
npm install
```

## Configuration

### Get an API Key

1. Visit [AirNowAPI.org](https://docs.airnowapi.org/account/request/)
2. Create an account and request an API key
3. The API key will be emailed to you

### Basic Configuration

Add the following to your `config/config.js` file:

```javascript
{
    module: "MMM-AirNowForecast",
    position: "top_right",
    config: {
        apiKey: "YOUR_AIRNOW_API_KEY",
        latitude: 33.4484,
        longitude: -112.0740
    }
}
```

### Configuration Options

| Option | Description | Type | Default |
|--------|-------------|------|---------|
| `apiKey` | **Required** - Your AirNow API key | String | `""` |
| `latitude` | **Required** - Location latitude | Number | `null` |
| `longitude` | **Required** - Location longitude | Number | `null` |
| `distance` | Search radius in miles for nearby reporting areas | Number | `25` |
| `updateInterval` | How often to fetch new data (milliseconds) | Number | `3600000` (1 hour) |
| `showForecast` | Display forecast data | Boolean | `true` |
| `showCurrent` | Display current conditions | Boolean | `true` |
| `pollutants` | Which pollutants to display | Array | `["OZONE", "PM2.5", "PM10"]` |
| `showLocation` | Display the reporting area location | Boolean | `true` |
| `roundValue` | Round AQI values to whole numbers | Boolean | `true` |
| `animationSpeed` | DOM update animation speed (milliseconds) | Number | `1000` |
| `initialLoadDelay` | Delay before first load (milliseconds) | Number | `0` |
| `retryDelay` | Delay between retries on error (milliseconds) | Number | `2500` |
| `maxRetries` | Maximum retry attempts on error | Number | `5` |

### Example Configuration

```javascript
{
    module: "MMM-AirNowForecast",
    position: "top_right",
    header: "Air Quality",
    config: {
        apiKey: "YOUR_AIRNOW_API_KEY",
        latitude: 33.4484,
        longitude: -112.0740,
        distance: 50,
        updateInterval: 1800000, // 30 minutes
        showForecast: true,
        showCurrent: true,
        pollutants: ["OZONE", "PM2.5"],
        showLocation: true,
        roundValue: true
    }
}
```

## AQI Categories and Colors

The module displays color-coded indicators based on EPA AQI categories:

- 🟢 **Good** (0-50): Green
- 🟡 **Moderate** (51-100): Yellow
- 🟠 **Unhealthy for Sensitive Groups** (101-150): Orange
- 🔴 **Unhealthy** (151-200): Red
- 🟣 **Very Unhealthy** (201-300): Purple
- 🟤 **Hazardous** (301+): Maroon

## API Information

This module uses the AirNow API which has the following limitations:
- 500 requests per hour per API key
- Data is typically updated hourly
- Forecast data may not be available for all locations

## Troubleshooting

### No data displayed
- Verify your API key is correct
- Check that latitude and longitude are valid
- Ensure you have an internet connection
- Check the MagicMirror logs for error messages

### Rate limiting errors
- The default update interval (1 hour) should prevent rate limiting
- If you have multiple modules using the same API key, increase the update interval

## License

MIT License - see [LICENSE](LICENSE) file for details

## Author

Created by [Liquescent](https://github.com/Liquescent-Development)
