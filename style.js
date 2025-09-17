// CityBus Tracker - Real-Time Public Transport Tracking System
class CityBusTracker {
    constructor() {
        this.map = null;
        this.vehicles = new Map();
        this.routes = new Map();
        this.stops = new Map();
        this.markers = new Map();
        this.updateInterval = null;
        this.updateFrequency = 10; // seconds
        this.userLocation = null;
        this.favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        this.feedback = JSON.parse(localStorage.getItem('feedback') || '[]');
        this.currentUser = null;
        this.userType = null; // 'user', 'driver', 'admin'
        
        // Punjab GPS tracking variables
        this.isPunjabTracking = false;
        this.punjabTrackingInterval = null;
        this.vehicleProgress = new Map();
        this.userMarker = null;
        this.busMarkers = new Map();
        
        this.init();
    }

    async init() {
        this.setupLoginSystem();
        this.setupEventListeners();
        
        // Initialize bus tracking system
        this.setupBusTracking();
        
        // Check if user is already logged in
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.userType = this.currentUser.type;
            this.showApplication();
        }
    }

    // Initialize Leaflet Map
    async initializeMap() {
        const defaultCenter = [31.1471, 75.3412]; // Punjab, India center
        
        this.map = L.map('map', {
            center: defaultCenter,
            zoom: 9,
            zoomControl: true,
            attributionControl: true,
            preferCanvas: true
        });

        // Add multiple tile layers for better map experience
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '©OpenStreetMap contributors',
            maxZoom: 19
        });

        const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '©Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
            maxZoom: 19
        });

        // Add default layer
        cartoLayer.addTo(this.map);

        // Add layer control
        const baseMaps = {
            "Street Map": osmLayer,
            "Light Theme": cartoLayer,
            "Satellite": satelliteLayer
        };
        
        L.control.layers(baseMaps).addTo(this.map);

        // Initialize GPS tracking
        this.initializeGPSTracking();
        
        // Draw Punjab bus routes
        this.drawPunjabBusRoutes();
        
        // Get user location
        this.getUserLocation();
    }

    // Initialize GPS Tracking
    initializeGPSTracking() {
        this.userLocation = null;
        this.userMarker = null;
        this.watchId = null;
        this.isTrackingLocation = false;
        
        // Start continuous location tracking
        this.startLocationTracking();
    }

    // Start continuous location tracking
    startLocationTracking() {
        if (navigator.geolocation) {
            this.updateGPSStatus('Getting location...', 'connected');
            
            // Get current position first
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.updateUserLocation(position);
                    this.startWatchingLocation();
                },
                (error) => {
                    this.handleLocationError(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 30000
                }
            );
        } else {
            this.updateGPSStatus('GPS not supported', 'error');
        }
    }

    // Start watching location changes
    startWatchingLocation() {
        if (navigator.geolocation) {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.updateUserLocation(position);
                },
                (error) => {
                    this.handleLocationError(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 10000
                }
            );
            this.isTrackingLocation = true;
            this.updateGPSStatus('Live tracking active', 'connected');
        }
    }

    // Update user location
    updateUserLocation(position) {
        this.userLocation = [position.coords.latitude, position.coords.longitude];
        
        if (this.map) {
            // Center map on user location if not already tracking buses
            if (!this.isTracking) {
                this.map.setView(this.userLocation, 13);
            }
            this.addUserLocationMarker();
        }
        
        this.updateUserLocationDisplay();
        this.findNearbyStops();
        this.updateGPSStatus('Live location active', 'connected');
    }

    // Handle location errors
    handleLocationError(error) {
        let message = 'Location error';
        switch(error.code) {
            case error.PERMISSION_DENIED:
                message = 'Location access denied';
                break;
            case error.POSITION_UNAVAILABLE:
                message = 'Location unavailable';
                break;
            case error.TIMEOUT:
                message = 'Location timeout';
                break;
        }
        this.updateGPSStatus(message, 'error');
        console.log('Location error:', message);
    }

    // Stop location tracking
    stopLocationTracking() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        this.isTrackingLocation = false;
        this.updateGPSStatus('Location tracking stopped', 'disconnected');
    }

    // Draw Punjab Bus Routes on Map
    drawPunjabBusRoutes() {
        if (!this.map) return;

        // Clear existing routes
        if (this.routePolylines) {
            this.routePolylines.forEach(polyline => {
                this.map.removeLayer(polyline);
            });
        }
        this.routePolylines = new Map();

        // Draw each route
        this.routes.forEach(route => {
            this.drawRoute(route);
        });
    }

    // Draw individual route
    drawRoute(route) {
        const coordinates = route.stops.map(stop => [stop.lat, stop.lng]);
        
        // Create route polyline
        const polyline = L.polyline(coordinates, {
            color: route.color,
            weight: 6,
            opacity: 0.8,
            smoothFactor: 1,
            className: `route-${route.id}`
        }).addTo(this.map);

        // Add route stops
        route.stops.forEach((stop, index) => {
            const stopIcon = L.divIcon({
                className: 'bus-stop-marker',
                html: `
                    <div class="stop-marker" style="background: ${route.color};">
                        <i class="fas fa-map-marker-alt"></i>
                        <div class="stop-number">${index + 1}</div>
                    </div>
                `,
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });

            const stopMarker = L.marker([stop.lat, stop.lng], { icon: stopIcon })
                .addTo(this.map)
                .bindPopup(`
                    <div class="stop-popup">
                        <h4>${stop.name}</h4>
                        <p><strong>Route:</strong> ${route.number} - ${route.name}</p>
                        <p><strong>Stop #:</strong> ${index + 1}</p>
                        <p><strong>Coordinates:</strong> ${stop.lat.toFixed(6)}, ${stop.lng.toFixed(6)}</p>
                    </div>
                `);
        });

        // Add route label at midpoint
        const midPoint = coordinates[Math.floor(coordinates.length / 2)];
        const routeLabel = L.marker(midPoint, {
            icon: L.divIcon({
                className: 'route-label-marker',
                html: `
                    <div class="route-label" style="background: ${route.color};">
                        <i class="fas fa-bus"></i>
                        <span>${route.number}</span>
                    </div>
                `,
                iconSize: [80, 30],
                iconAnchor: [40, 15]
            })
        }).addTo(this.map);

        this.routePolylines.set(route.id, polyline);
    }

    // Get user location (legacy method for compatibility)
    getUserLocation() {
        this.startLocationTracking();
    }


    // Update user location display
    updateUserLocationDisplay() {
        if (this.userLocation) {
            const coordsElement = document.getElementById('userLocationCoords');
            if (coordsElement) {
                coordsElement.textContent = `${this.userLocation[0].toFixed(6)}, ${this.userLocation[1].toFixed(6)}`;
            }
        }
    }

    // Load Punjab bus routes data
    loadMockData() {
        const punjabRoutes = [
            {
                id: 'route-pb1',
                number: 'PB-1',
                name: 'Amritsar → Chandigarh',
                color: '#ff6b6b',
                routeClass: 'route-pb1',
                stops: [
                    { id: 'stop-amr', name: 'Amritsar Bus Stand', lat: 31.6340, lng: 74.8723 },
                    { id: 'stop-jal', name: 'Jalandhar City', lat: 31.3260, lng: 75.5762 },
                    { id: 'stop-lud', name: 'Ludhiana Railway Station', lat: 30.9010, lng: 75.8573 },
                    { id: 'stop-pat', name: 'Patiala Bus Stand', lat: 30.3398, lng: 76.3869 },
                    { id: 'stop-chd', name: 'Chandigarh ISBT', lat: 30.7333, lng: 76.7794 }
                ]
            },
            {
                id: 'route-pb2',
                number: 'PB-2',
                name: 'Bathinda → Patiala',
                color: '#4ecdc4',
                routeClass: 'route-pb2',
                stops: [
                    { id: 'stop-bat', name: 'Bathinda Bus Stand', lat: 30.2110, lng: 74.9455 },
                    { id: 'stop-muk', name: 'Muktsar City', lat: 30.4740, lng: 74.5160 },
                    { id: 'stop-far', name: 'Faridkot Railway Station', lat: 30.6739, lng: 74.7559 },
                    { id: 'stop-san', name: 'Sangrur Bus Stand', lat: 30.2459, lng: 75.8429 },
                    { id: 'stop-pat2', name: 'Patiala Bus Stand', lat: 30.3398, lng: 76.3869 }
                ]
            },
            {
                id: 'route-pb3',
                number: 'PB-3',
                name: 'Ferozepur → Amritsar',
                color: '#45b7d1',
                routeClass: 'route-pb3',
                stops: [
                    { id: 'stop-fer', name: 'Ferozepur Bus Stand', lat: 30.9167, lng: 74.6000 },
                    { id: 'stop-abh', name: 'Abohar City', lat: 30.1440, lng: 74.1990 },
                    { id: 'stop-mal', name: 'Maler Kotla', lat: 30.5309, lng: 75.8805 },
                    { id: 'stop-barn', name: 'Barnala Bus Stand', lat: 30.3745, lng: 75.5487 },
                    { id: 'stop-amr2', name: 'Amritsar Bus Stand', lat: 31.6340, lng: 74.8723 }
                ]
            },
            {
                id: 'route-pb4',
                number: 'PB-4',
                name: 'Gurdaspur → Ludhiana',
                color: '#96ceb4',
                routeClass: 'route-pb4',
                stops: [
                    { id: 'stop-gur', name: 'Gurdaspur Bus Stand', lat: 32.0419, lng: 75.4053 },
                    { id: 'stop-bat2', name: 'Batala City', lat: 31.8186, lng: 75.2028 },
                    { id: 'stop-qad', name: 'Qadian Bus Stand', lat: 31.8219, lng: 75.3761 },
                    { id: 'stop-kap', name: 'Kapurthala Railway Station', lat: 31.3801, lng: 75.3811 },
                    { id: 'stop-lud2', name: 'Ludhiana Railway Station', lat: 30.9010, lng: 75.8573 }
                ]
            },
            {
                id: 'route-pb5',
                number: 'PB-5',
                name: 'Hoshiarpur → Jalandhar',
                color: '#feca57',
                routeClass: 'route-pb5',
                stops: [
                    { id: 'stop-hos', name: 'Hoshiarpur Bus Stand', lat: 31.5322, lng: 75.9170 },
                    { id: 'stop-das', name: 'Dasuya City', lat: 31.8167, lng: 75.6667 },
                    { id: 'stop-mah', name: 'Mukerian Railway Station', lat: 31.9500, lng: 75.6167 },
                    { id: 'stop-nak', name: 'Nakodar Bus Stand', lat: 31.1256, lng: 75.4750 },
                    { id: 'stop-jal2', name: 'Jalandhar City', lat: 31.3260, lng: 75.5762 }
                ]
            }
        ];

        const punjabVehicles = [
            {
                id: 'pb-bus-001',
                routeId: 'route-pb1',
                lat: 31.3260,
                lng: 75.5762,
                speed: 35,
                heading: 45,
                capacity: 50,
                passengers: 25,
                status: 'on-time',
                lastUpdate: new Date()
            },
            {
                id: 'pb-bus-002',
                routeId: 'route-pb2',
                lat: 30.4740,
                lng: 74.5160,
                speed: 30,
                heading: 60,
                capacity: 45,
                passengers: 20,
                status: 'on-time',
                lastUpdate: new Date()
            },
            {
                id: 'pb-bus-003',
                routeId: 'route-pb3',
                lat: 30.5309,
                lng: 75.8805,
                speed: 40,
                heading: 80,
                capacity: 50,
                passengers: 30,
                status: 'delayed',
                lastUpdate: new Date()
            },
            {
                id: 'pb-bus-004',
                routeId: 'route-pb4',
                lat: 31.8186,
                lng: 75.2028,
                speed: 32,
                heading: 100,
                capacity: 45,
                passengers: 18,
                status: 'on-time',
                lastUpdate: new Date()
            },
            {
                id: 'pb-bus-005',
                routeId: 'route-pb5',
                lat: 31.8167,
                lng: 75.6667,
                speed: 38,
                heading: 120,
                capacity: 40,
                passengers: 22,
                status: 'on-time',
                lastUpdate: new Date()
            }
        ];

        // Load Punjab routes
        punjabRoutes.forEach(route => {
            this.routes.set(route.id, route);
            this.addRouteToMap(route);
        });

        // Load Punjab vehicles
        punjabVehicles.forEach(vehicle => {
            this.vehicles.set(vehicle.id, vehicle);
            this.addVehicleToMap(vehicle);
        });

        // Load Punjab stops
        punjabRoutes.forEach(route => {
            route.stops.forEach(stop => {
                this.stops.set(stop.id, stop);
                this.addStopToMap(stop);
            });
        });

        // Add some sample favorites
        if (this.favorites.length === 0) {
            this.favorites = [
                {
                    id: 'fav-1',
                    name: 'Amritsar Bus Stand',
                    type: 'Bus Stop',
                    lat: 31.6340,
                    lng: 74.8723
                },
                {
                    id: 'fav-2',
                    name: 'PB-1 Route',
                    type: 'Bus Route',
                    routeId: 'route-pb1'
                }
            ];
            localStorage.setItem('favorites', JSON.stringify(this.favorites));
        }

        this.updateUI();
    }

    // Add route to map
    addRouteToMap(route) {
        if (!this.map) return;
        
        const routePath = route.stops.map(stop => [stop.lat, stop.lng]);
        const polyline = L.polyline(routePath, {
            color: route.color,
            weight: 4,
            opacity: 0.7
        }).addTo(this.map);
    }

    // Add vehicle to map
    addVehicleToMap(vehicle) {
        if (!this.map) return;
        
        const route = this.routes.get(vehicle.routeId);
        if (!route) return;

        const vehicleIcon = L.divIcon({
            className: 'vehicle-marker',
            html: `<div style="background: ${route.color}; color: white; padding: 6px; border-radius: 50%; font-size: 14px;"><i class="fas fa-bus"></i></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([vehicle.lat, vehicle.lng], { icon: vehicleIcon })
            .addTo(this.map)
            .bindPopup(`Bus ${vehicle.id}<br>Route: ${route.number}<br>Status: ${vehicle.status}`);

        this.markers.set(vehicle.id, marker);
    }

    // Add stop to map
    addStopToMap(stop) {
        if (!this.map) return;
        
        const stopIcon = L.divIcon({
            className: 'stop-marker',
            html: '<div style="background: #ffffff; color: #333; padding: 4px; border-radius: 4px; font-size: 12px;"><i class="fas fa-map-marker-alt"></i></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        L.marker([stop.lat, stop.lng], { icon: stopIcon })
            .addTo(this.map)
            .bindPopup(`<strong>${stop.name}</strong>`);
    }

    // Load dashboard data
    loadDashboardData() {
        this.loadRouteSummary();
        this.loadBusStatus();
        this.loadNextArrivals();
        this.loadNearbyStops();
        this.loadDistanceTracker();
        this.loadFavorites();
        this.loadLiveBusStatus();
    }

    // Load route summary
    loadRouteSummary() {
        const routeSummary = document.getElementById('routeSummary');
        if (!routeSummary) return;
        
        routeSummary.innerHTML = '';
        
        this.routes.forEach(route => {
            const activeVehicles = Array.from(this.vehicles.values())
                .filter(v => v.routeId === route.id).length;
            
            const item = document.createElement('div');
            item.className = 'route-item';
            item.innerHTML = `
                <div class="route-header">
                    <span class="route-number">${route.number}</span>
                    <span class="route-status on-time">${activeVehicles} active</span>
                </div>
                <div class="route-details">${route.name}</div>
            `;
            routeSummary.appendChild(item);
        });
    }

    // Load bus status
    loadBusStatus() {
        const busStatus = document.getElementById('busStatus');
        if (!busStatus) return;
        
        busStatus.innerHTML = '';
        
        this.vehicles.forEach(vehicle => {
            const route = this.routes.get(vehicle.routeId);
            if (!route) return;
            
            const item = document.createElement('div');
            item.className = 'bus-item';
            item.innerHTML = `
                <div class="tracking-bus-info">
                    <div class="tracking-bus-number">${vehicle.id}</div>
                    <div class="tracking-bus-route">${route.number} - ${route.name}</div>
                    <div class="tracking-bus-location">Status: ${vehicle.status}</div>
                </div>
                <div class="tracking-bus-status">
                    <div class="tracking-status-indicator ${vehicle.status}"></div>
                    <div class="tracking-speed">${vehicle.speed} km/h</div>
                </div>
            `;
            busStatus.appendChild(item);
        });
    }

    // Load next arrivals
    loadNextArrivals() {
        const nextArrivals = document.getElementById('nextArrivals');
        if (!nextArrivals) return;
        
        nextArrivals.innerHTML = '';
        
        const arrivals = this.generateMockArrivals();
        
        arrivals.forEach(arrival => {
            const item = document.createElement('div');
            item.className = 'arrival-item';
            item.innerHTML = `
                <div>
                    <div class="arrival-time">${arrival.time}</div>
                    <div class="route-details">${arrival.route} to ${arrival.destination}</div>
                </div>
                <div class="route-status ${arrival.status}">${arrival.status}</div>
            `;
            nextArrivals.appendChild(item);
        });
    }

    // Load nearby stops
    loadNearbyStops() {
        const nearbyStops = document.getElementById('nearbyStops');
        if (!nearbyStops) return;
        
        nearbyStops.innerHTML = '';
        
        if (this.userLocation) {
            const nearby = this.findNearbyStops();
            nearby.forEach(stop => {
                const item = document.createElement('div');
                item.className = 'stop-item';
                item.innerHTML = `
                    <div>
                        <div class="route-details">${stop.name}</div>
                        <div class="stop-distance">${stop.distance.toFixed(1)} km away</div>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                `;
                nearbyStops.appendChild(item);
            });
        } else {
            nearbyStops.innerHTML = '<div class="text-muted">Enable location to see nearby stops</div>';
        }
    }

    // Load distance tracker
    loadDistanceTracker() {
        const distanceTracker = document.getElementById('distanceTracker');
        if (!distanceTracker) return;
        
        distanceTracker.innerHTML = '';
        
        if (!this.userLocation) {
            distanceTracker.innerHTML = '<div class="text-muted">Enable GPS to track bus distances</div>';
            return;
        }

        // Sort buses by distance from user
        const busesWithDistance = Array.from(this.vehicles.values()).map(vehicle => {
            const route = this.routes.get(vehicle.routeId);
            const distance = this.calculateDistance(
                this.userLocation[0], this.userLocation[1],
                vehicle.lat, vehicle.lng
            );
            return { vehicle, route, distance };
        }).sort((a, b) => a.distance - b.distance);

        busesWithDistance.forEach(({ vehicle, route, distance }) => {
            const item = document.createElement('div');
            item.className = 'distance-item';
            
            const distanceText = distance < 1 ? 
                `${Math.round(distance * 1000)}m` : 
                `${distance.toFixed(1)}km`;
            
            const direction = this.getDirectionFromUser(vehicle.lat, vehicle.lng);
            
            item.innerHTML = `
                <div class="bus-info">
                    <div class="bus-route-indicator ${route.routeClass}">${route.number}</div>
                    <div class="bus-details">
                        <div class="bus-number">${vehicle.id}</div>
                        <div class="bus-route-name">${route.name}</div>
                        <div class="bus-status">${vehicle.status} • ${vehicle.speed} km/h</div>
                    </div>
                </div>
                <div class="distance-info">
                    <div class="distance-value">${distanceText}</div>
                    <div class="distance-unit">away</div>
                    <div class="distance-direction">${direction}</div>
                </div>
            `;
            distanceTracker.appendChild(item);
        });
    }

    // Load favorites
    loadFavorites() {
        const favoritesList = document.getElementById('favoritesList');
        if (!favoritesList) return;
        
        favoritesList.innerHTML = '';
        
        if (this.favorites.length === 0) {
            favoritesList.innerHTML = '<div class="text-muted">No favorites added yet</div>';
            return;
        }
        
        this.favorites.forEach(favorite => {
            const item = document.createElement('div');
            item.className = 'favorite-item';
            item.innerHTML = `
                <div class="favorite-info">
                    <div class="favorite-name">${favorite.name}</div>
                    <div class="favorite-type">${favorite.type}</div>
                </div>
                <button class="favorite-remove" onclick="app.removeFavorite('${favorite.id}')">
                    <i class="fas fa-times"></i>
                </button>
            `;
            favoritesList.appendChild(item);
        });
    }

    // Load live bus status
    loadLiveBusStatus() {
        const vehiclesList = document.getElementById('vehiclesList');
        if (!vehiclesList) return;
        
        vehiclesList.innerHTML = '';
        
        this.vehicles.forEach(vehicle => {
            const route = this.routes.get(vehicle.routeId);
            if (!route) return;
            
            const item = document.createElement('div');
            item.className = 'vehicle-item';
            
            const statusColor = vehicle.status === 'on-time' ? '#4ade80' : 
                              vehicle.status === 'delayed' ? '#f59e0b' : '#ef4444';
            
            item.innerHTML = `
                <div class="vehicle-info">
                    <div class="vehicle-number">${vehicle.id}</div>
                    <div class="vehicle-route">${route.number} - ${route.name}</div>
                    <div class="vehicle-status" style="color: ${statusColor}">
                        ${vehicle.status} • ${vehicle.speed} km/h
                    </div>
                </div>
                <div class="vehicle-passengers">
                    ${vehicle.passengers}/${vehicle.capacity}
                </div>
            `;
            vehiclesList.appendChild(item);
        });
    }

    // Remove favorite
    removeFavorite(favoriteId) {
        this.favorites = this.favorites.filter(fav => fav.id !== favoriteId);
        localStorage.setItem('favorites', JSON.stringify(this.favorites));
        this.loadFavorites();
        this.showSuccess('Favorite removed');
    }

    // Get direction from user to bus
    getDirectionFromUser(busLat, busLng) {
        if (!this.userLocation) return 'Unknown';
        
        const userLat = this.userLocation[0];
        const userLng = this.userLocation[1];
        
        const deltaLat = busLat - userLat;
        const deltaLng = busLng - userLng;
        
        const angle = Math.atan2(deltaLng, deltaLat) * 180 / Math.PI;
        
        if (angle >= -22.5 && angle < 22.5) return 'North';
        if (angle >= 22.5 && angle < 67.5) return 'Northeast';
        if (angle >= 67.5 && angle < 112.5) return 'East';
        if (angle >= 112.5 && angle < 157.5) return 'Southeast';
        if (angle >= 157.5 || angle < -157.5) return 'South';
        if (angle >= -157.5 && angle < -112.5) return 'Southwest';
        if (angle >= -112.5 && angle < -67.5) return 'West';
        if (angle >= -67.5 && angle < -22.5) return 'Northwest';
        
        return 'Unknown';
    }

    // Start Punjab GPS tracking
    startPunjabGPSTracking() {
        this.isPunjabTracking = true;
        document.getElementById('startPunjabTracking').style.display = 'none';
        document.getElementById('stopPunjabTracking').style.display = 'inline-flex';
        
        this.updateGPSStatus('Punjab GPS Active', 'connected');
        this.showSuccess('Punjab GPS tracking started');
        
        // Start tracking interval
        this.punjabTrackingInterval = setInterval(() => {
            this.updateBusPositions();
            this.loadDistanceTracker();
            this.updateUserLocationDisplay();
            this.updateBusMarkersOnMap();
        }, 3000); // Update every 3 seconds
        
        // Initial update
        this.loadDistanceTracker();
        this.updateBusMarkersOnMap();
    }

    // Stop Punjab GPS tracking
    stopPunjabGPSTracking() {
        this.isPunjabTracking = false;
        document.getElementById('startPunjabTracking').style.display = 'inline-flex';
        document.getElementById('stopPunjabTracking').style.display = 'none';
        
        this.updateGPSStatus('GPS Ready', '');
        this.showSuccess('Punjab GPS tracking stopped');
        
        if (this.punjabTrackingInterval) {
            clearInterval(this.punjabTrackingInterval);
            this.punjabTrackingInterval = null;
        }
    }

    // Update GPS status display
    updateGPSStatus(text, status) {
        const statusElement = document.getElementById('gpsStatusValue');
        if (statusElement) {
            statusElement.textContent = text;
            statusElement.className = `status-value ${status}`;
        }
        
        const userLocationElement = document.getElementById('userLocationDisplay');
        if (userLocationElement && this.userLocation) {
            userLocationElement.textContent = `${this.userLocation[0].toFixed(4)}, ${this.userLocation[1].toFixed(4)}`;
        }
    }

    // Update bus markers on map
    updateBusMarkersOnMap() {
        if (!this.map) return;
        
        this.vehicles.forEach((vehicle, vehicleId) => {
            const marker = this.markers.get(vehicleId);
            if (marker) {
                marker.setLatLng([vehicle.lat, vehicle.lng]);
                
                // Update popup with distance if user location is available
                const route = this.routes.get(vehicle.routeId);
                let popupContent = `Bus ${vehicle.id}<br>Route: ${route.number}<br>Status: ${vehicle.status}`;
                
                if (this.userLocation) {
                    const distance = this.calculateDistance(
                        this.userLocation[0], this.userLocation[1],
                        vehicle.lat, vehicle.lng
                    );
                    const distanceText = distance < 1 ? 
                        `${Math.round(distance * 1000)}m` : 
                        `${distance.toFixed(1)}km`;
                    popupContent += `<br>Distance: ${distanceText}`;
                }
                
                marker.setPopupContent(popupContent);
            }
        });
    }

    // Setup login system
    setupLoginSystem() {
        // Login tab switching
        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.closest('.login-tab').dataset.tab;
                this.switchLoginTab(tabName);
            });
        });

        // Method tab switching (for user login)
        document.querySelectorAll('.method-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const method = e.target.closest('.method-tab').dataset.method;
                this.switchMethodTab(method);
            });
        });

        // Form submissions
        document.getElementById('emailForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUserLogin('email');
        });

        document.getElementById('mobileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUserLogin('mobile');
        });

        document.getElementById('socialForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUserLogin('social');
        });

        document.getElementById('driverForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDriverLogin();
        });

        document.getElementById('adminForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAdminLogin();
        });

        // OTP button
        document.getElementById('sendOTP').addEventListener('click', () => {
            this.sendOTP();
        });

        // Social login buttons
        document.querySelectorAll('.social-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const provider = e.target.closest('.social-btn').classList[1];
                this.handleSocialLogin(provider);
            });
        });

        // Registration system
        this.setupRegistrationSystem();
    }

    // Setup event listeners
    setupEventListeners() {
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Settings modal
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettingsModal();
        });

        document.getElementById('closeSettingsBtn').addEventListener('click', () => {
            this.hideSettingsModal();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Map control buttons
        document.getElementById('centerMapBtn').addEventListener('click', () => {
            this.centerMapOnUser();
        });

        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        document.getElementById('getLocationBtn').addEventListener('click', () => {
            this.getUserLocation();
        });

        // Punjab GPS tracking buttons
        document.getElementById('startPunjabTracking').addEventListener('click', () => {
            this.startPunjabGPSTracking();
        });

        document.getElementById('stopPunjabTracking').addEventListener('click', () => {
            this.stopPunjabGPSTracking();
        });

        // Quick action buttons
        document.getElementById('reportIssueBtn').addEventListener('click', () => {
            this.showReportIssueModal();
        });

        // Fullscreen change event listeners
        document.addEventListener('fullscreenchange', () => {
            this.handleFullscreenChange();
        });
        
        document.addEventListener('webkitfullscreenchange', () => {
            this.handleFullscreenChange();
        });
        
        document.addEventListener('mozfullscreenchange', () => {
            this.handleFullscreenChange();
        });
        
        document.addEventListener('MSFullscreenChange', () => {
            this.handleFullscreenChange();
        });

        // Ticket booking
        this.setupTicketBooking();

        // Right side sign-in functionality
        this.setupRightSignIn();

        // GPS and tracking functionality
        this.setupGPSTracking();

        // Tickets feature
        this.setupTicketsFeature();

        // Feedback feature
        this.setupFeedbackFeature();

        // Booking success modal
        document.getElementById('closeSuccessBtn')?.addEventListener('click', () => {
            this.hideBookingSuccess();
        });

        document.getElementById('downloadTicketBtn')?.addEventListener('click', () => {
            this.downloadTicket();
        });

        document.getElementById('viewTicketBtn')?.addEventListener('click', () => {
            this.viewTicket();
        });

        // Payment method tabs
        document.querySelectorAll('.payment-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchPaymentMethod(e.target.dataset.method);
            });
        });

        // Digital wallet options
        document.querySelectorAll('.wallet-option').forEach(option => {
            option.addEventListener('click', (e) => {
                this.selectWalletOption(e.target.dataset.wallet);
            });
        });
    }

    // Setup registration system
    setupRegistrationSystem() {
        // Show registration modal
        document.getElementById('showRegisterBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegistrationModal();
        });

        // Close registration modal
        document.getElementById('closeRegisterBtn').addEventListener('click', () => {
            this.hideRegistrationModal();
        });

        // Back to login
        document.getElementById('backToLoginBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.hideRegistrationModal();
        });

        // Registration tab switching
        document.querySelectorAll('.register-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const registerType = e.target.closest('.register-tab').dataset.register;
                this.switchRegisterTab(registerType);
            });
        });

        // Registration form submissions
        document.getElementById('userRegisterForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUserRegistration();
        });

        document.getElementById('driverRegisterForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDriverRegistration();
        });
    }



    // Setup right side sign-in functionality
    setupRightSignIn() {
        // Toggle sign-in panel
        document.getElementById('signinToggleBtn').addEventListener('click', () => {
            this.toggleRightSignIn();
        });

        document.getElementById('toggleSigninBtn').addEventListener('click', () => {
            this.toggleRightSignIn();
        });

        // Right sign-in tab switching
        document.querySelectorAll('.signin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const signinType = e.target.closest('.signin-tab').dataset.signin;
                this.switchRightSignInTab(signinType);
            });
        });

        // Right sign-in form submissions
        document.getElementById('rightUserForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRightUserLogin();
        });

        document.getElementById('rightDriverForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRightDriverLogin();
        });

        document.getElementById('rightAdminForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRightAdminLogin();
        });

        // Right registration links
        document.getElementById('rightRegisterLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegistrationModal();
        });

        document.getElementById('rightDriverRegisterLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegistrationModal();
        });

        document.getElementById('rightAdminRegisterLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegistrationModal();
        });
    }

    // Setup GPS and tracking functionality
    setupGPSTracking() {
        // GPS tracking variables
        this.userLocation = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.gpsWatchId = null;
        this.busMarkers = new Map();
        this.userMarker = null;

        // GPS tracking buttons
        document.getElementById('getLocationBtn').addEventListener('click', () => {
            this.getUserLocation();
        });

        document.getElementById('trackBusBtn').addEventListener('click', () => {
            this.toggleBusTracking();
        });

        document.getElementById('startTrackingBtn').addEventListener('click', () => {
            this.startTracking();
        });

        document.getElementById('stopTrackingBtn').addEventListener('click', () => {
            this.stopTracking();
        });

        // Initialize GPS
        this.initializeGPS();
    }

    // Initialize GPS system
    initializeGPS() {
        if ('geolocation' in navigator) {
            this.updateGPSStatus('GPS Available', 'connected');
            this.getUserLocation();
        } else {
            this.updateGPSStatus('GPS Not Available', 'error');
        }
    }

    // Update GPS status
    updateGPSStatus(text, status) {
        const statusElement = document.getElementById('gpsStatusText');
        const statusContainer = document.getElementById('gpsStatus');
        
        statusElement.textContent = text;
        statusContainer.className = `gps-status ${status}`;
    }

    // Get user location
    getUserLocation() {
        this.updateGPSStatus('Getting Location...', '');
        
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    
                    this.updateUserLocationDisplay();
                    this.updateGPSStatus('Location Found', 'connected');
                    
                    if (this.map) {
                        this.centerMapOnUser();
                    }
                },
                (error) => {
                    console.error('Error getting location:', error);
                    this.updateGPSStatus('Location Error', 'error');
                    this.showError('Unable to get your location. Please check GPS permissions.');
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000
                }
            );
        }
    }

    // Update user location display
    updateUserLocationDisplay() {
        if (this.userLocation) {
            const coordsElement = document.getElementById('userLocationCoords');
            coordsElement.textContent = `${this.userLocation.lat.toFixed(6)}, ${this.userLocation.lng.toFixed(6)}`;
        }
    }

    // Update user location display
    updateUserLocationDisplay() {
        if (this.userLocation) {
            const coordsElement = document.getElementById('userLocationCoords');
            if (coordsElement) {
                coordsElement.textContent = `${this.userLocation.lat.toFixed(6)}, ${this.userLocation.lng.toFixed(6)}`;
            }
        }
    }

    // Toggle bus tracking
    toggleBusTracking() {
        if (this.isTracking) {
            this.stopBusTracking();
        } else {
            this.startBusTracking();
        }
    }

    // Start real-time tracking
    startTracking() {
        this.isTracking = true;
        document.getElementById('startTrackingBtn').style.display = 'none';
        document.getElementById('stopTrackingBtn').style.display = 'block';
        
        this.updateGPSStatus('Tracking Active', 'connected');
        this.showSuccess('Real-time tracking started');

        // Start tracking interval
        this.trackingInterval = setInterval(() => {
            this.updateBusPositions();
            this.findNearestBus();
        }, 5000); // Update every 5 seconds

        // Initial update
        this.updateBusPositions();
        this.findNearestBus();
    }

    // Stop tracking
    stopTracking() {
        this.isTracking = false;
        document.getElementById('startTrackingBtn').style.display = 'block';
        document.getElementById('stopTrackingBtn').style.display = 'none';
        
        this.updateGPSStatus('Tracking Stopped', '');
        this.showSuccess('Tracking stopped');

        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }
    }

    // Update bus positions
    updateBusPositions() {
        if (!this.vehicleProgress) this.vehicleProgress = new Map();

        // Initialize progress for vehicles if missing
        this.vehicles.forEach((vehicle) => {
            if (!this.vehicleProgress.has(vehicle.id)) {
                const route = this.routes.get(vehicle.routeId);
                if (!route || route.stops.length < 2) return;
                this.vehicleProgress.set(vehicle.id, { segmentIndex: 0, t: 0 });
                // Start at first stop
                vehicle.lat = route.stops[0].lat;
                vehicle.lng = route.stops[0].lng;
            }
        });

        // Move vehicles along their routes
        this.vehicles.forEach((vehicle) => {
            const route = this.routes.get(vehicle.routeId);
            if (!route || route.stops.length < 2) return;

            const progress = this.vehicleProgress.get(vehicle.id);
            const speedKmh = Math.max(15, Math.min(40, vehicle.speed || 25));
            const metersPerSecond = (speedKmh * 1000) / 3600;
            const stepSeconds = 5; // matches tracking interval

            // Current segment endpoints
            const a = route.stops[progress.segmentIndex];
            const b = route.stops[(progress.segmentIndex + 1) % route.stops.length];

            // Rough distance in meters between a and b using haversine
            const R = 6371000;
            const dLat = (b.lat - a.lat) * Math.PI / 180;
            const dLon = (b.lng - a.lng) * Math.PI / 180;
            const lat1 = a.lat * Math.PI / 180;
            const lat2 = b.lat * Math.PI / 180;
            const hav = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2);
            const dist = 2 * R * Math.atan2(Math.sqrt(hav), Math.sqrt(1-hav));

            const segmentTime = dist / metersPerSecond; // seconds to finish segment
            const dt = stepSeconds / Math.max(1, segmentTime); // fraction step
            progress.t += dt;
            if (progress.t >= 1) {
                progress.t = progress.t - 1;
                progress.segmentIndex = (progress.segmentIndex + 1) % route.stops.length;
            }

            const curA = route.stops[progress.segmentIndex];
            const curB = route.stops[(progress.segmentIndex + 1) % route.stops.length];
            const t = Math.max(0, Math.min(1, progress.t));
            vehicle.lat = curA.lat + (curB.lat - curA.lat) * t;
            vehicle.lng = curA.lng + (curB.lng - curA.lng) * t;
            vehicle.status = 'online';
            vehicle.nextStop = curB.name;
        });

        // Update tracking list and stats from vehicles
        this.updateTrackingListFromVehicles();
        this.updateTrackingStatsFromVehicles();
    }

    // Tracking helpers based on real vehicles
    updateTrackingListFromVehicles() {
        const trackingList = document.getElementById('trackingList');
        if (!trackingList) return;
        trackingList.innerHTML = '';
        const vehiclesArray = Array.from(this.vehicles.values()).map(v => {
            const distKm = this.distanceFromUserKm(v.lat, v.lng);
            return { vehicle: v, distKm };
        }).sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity));

        vehiclesArray.forEach(({ vehicle, distKm }) => {
            const route = this.routes.get(vehicle.routeId);
            const distText = this.formatDistance(distKm);
            const item = document.createElement('div');
            item.className = `tracking-item ${vehicle.status || 'online'}`;
            item.innerHTML = `
                <div class=\"tracking-bus-info\">\n                    <div class=\"tracking-bus-number\">${vehicle.id}</div>\n                    <div class=\"tracking-bus-route\">${route ? (route.number + ' - ' + route.name) : ''}</div>\n                    <div class=\"tracking-bus-location\">Next: ${vehicle.nextStop || '-'}</div>\n                    <div class=\"tracking-bus-location\">Distance: ${distText}</div>\n                </div>\n                <div class=\"tracking-bus-status\">\n                    <div class=\"tracking-status-indicator\"></div>\n                    <div class=\"tracking-speed\">${Math.round(vehicle.speed || 25)} km/h</div>\n                </div>
            `;
            trackingList.appendChild(item);
        });
    }

    updateTrackingStatsFromVehicles() {
        const vehiclesArray = Array.from(this.vehicles.values());
        const onlineBuses = vehiclesArray.length;
        const uniqueRoutes = new Set(vehiclesArray.map(v => v.routeId)).size;
        document.getElementById('activeBusesCount').textContent = onlineBuses;
        document.getElementById('activeRoutesCount').textContent = uniqueRoutes;
        document.getElementById('activeVehicles').textContent = onlineBuses;
    }

    // Distance helpers
    distanceFromUserKm(lat, lng) {
        if (!this.userLocation || this.userLocation.lat == null || this.userLocation.lng == null) return null;
        const R = 6371; // km
        const dLat = (lat - this.userLocation.lat) * Math.PI / 180;
        const dLon = (lng - this.userLocation.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.userLocation.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    formatDistance(km) {
        if (km == null) return '—';
        return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    }

    formatDistanceFromUser(lat, lng) {
        return this.formatDistance(this.distanceFromUserKm(lat, lng));
    }

    // Find nearest bus
    findNearestBus() {
        if (!this.userLocation) return;

        const busData = this.generateMockBusData();
        let nearestBus = null;
        let minDistance = Infinity;

        busData.forEach(bus => {
            const distance = this.calculateDistance(
                this.userLocation.lat, this.userLocation.lng,
                bus.lat, bus.lng
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestBus = bus;
            }
        });

        if (nearestBus) {
            const distanceText = minDistance < 1 ? 
                `${Math.round(minDistance * 1000)}m away` : 
                `${minDistance.toFixed(1)}km away`;
            
            document.getElementById('nearestBusInfo').textContent = 
                `${nearestBus.number} - ${distanceText}`;
        }
    }

    // Calculate distance between two points
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Update tracking list
    updateTrackingList(busData) {
        const trackingList = document.getElementById('trackingList');
        trackingList.innerHTML = '';

        busData.forEach(bus => {
            const item = document.createElement('div');
            item.className = `tracking-item ${bus.status}`;
            item.innerHTML = `
                <div class="tracking-bus-info">
                    <div class="tracking-bus-number">${bus.number}</div>
                    <div class="tracking-bus-route">${bus.route}</div>
                    <div class="tracking-bus-location">${bus.nextStop}</div>
                </div>
                <div class="tracking-bus-status">
                    <div class="tracking-status-indicator ${bus.status}"></div>
                    <div class="tracking-speed">${bus.speed} km/h</div>
                </div>
            `;
            trackingList.appendChild(item);
        });
    }

    // Update tracking stats
    updateTrackingStats(busData) {
        const onlineBuses = busData.filter(bus => bus.status === 'online').length;
        const uniqueRoutes = [...new Set(busData.map(bus => bus.route))].length;
        
        document.getElementById('activeBusesCount').textContent = onlineBuses;
        document.getElementById('activeRoutesCount').textContent = uniqueRoutes;
        document.getElementById('activeVehicles').textContent = onlineBuses;
    }

    // Switch tabs
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');

        // If switching to tracking tab, start tracking if not already active
        if (tabName === 'tracking' && !this.isTracking) {
            this.startTracking();
        }
    }

    // Show settings modal
    showSettingsModal() {
        document.getElementById('settingsModal').classList.add('active');
    }

    // Hide settings modal
    hideSettingsModal() {
        document.getElementById('settingsModal').classList.remove('active');
    }

    // Refresh data
    refreshData() {
        this.showLoading();
        setTimeout(() => {
            this.updateVehiclePositions();
            this.updateUI();
            this.hideLoading();
        }, 1000);
    }

    // Handle search
    handleSearch(query) {
        if (query.length < 2) {
            this.loadRoutesList();
            return;
        }

        const results = [];
        const lowerQuery = query.toLowerCase();

        this.routes.forEach(route => {
            if (route.number.toLowerCase().includes(lowerQuery) ||
                route.name.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'route', data: route });
            }
        });

        this.displaySearchResults(results);
    }

    // Display search results
    displaySearchResults(results) {
        const routeList = document.getElementById('routeList');
        routeList.innerHTML = '';

        results.forEach(result => {
            const route = result.data;
            const item = document.createElement('div');
            item.className = 'route-item';
            item.innerHTML = `
                <div class="route-header">
                    <span class="route-number">${route.number}</span>
                    <span class="route-status on-time">Active</span>
                </div>
                <div class="route-details">${route.name}</div>
            `;
            routeList.appendChild(item);
        });
    }

    // Start real-time updates
    startRealTimeUpdates() {
        this.updateInterval = setInterval(() => {
            this.updateVehiclePositions();
            this.updateUI();
            this.updateLastUpdate();
        }, this.updateFrequency * 1000);
    }

    // Update vehicle positions
    updateVehiclePositions() {
        this.vehicles.forEach(vehicle => {
            const movement = this.calculateVehicleMovement(vehicle);
            vehicle.lat += movement.lat;
            vehicle.lng += movement.lng;
            vehicle.speed = Math.max(0, vehicle.speed + (Math.random() - 0.5) * 5);
            vehicle.lastUpdate = new Date();
        });
    }

    // Calculate vehicle movement
    calculateVehicleMovement(vehicle) {
        const speed = vehicle.speed / 3600;
        const heading = vehicle.heading * Math.PI / 180;
        
        return {
            lat: speed * Math.cos(heading) * 0.01,
            lng: speed * Math.sin(heading) * 0.01
        };
    }

    // Update UI elements
    updateUI() {
        this.updateVehicleCount();
        this.loadRoutesList();
        this.loadArrivalsList();
        this.loadStopsList();
        this.loadScheduleList();
        this.loadFavoritesList();
        this.loadAlertsList();
        this.loadTicketsList();
        this.loadFeedbackUI();
        this.loadDashboardData();
    }

    // Update vehicle count
    updateVehicleCount() {
        document.getElementById('activeVehicles').textContent = this.vehicles.size;
    }

    // Load routes list
    loadRoutesList() {
        const routeList = document.getElementById('routeList');
        routeList.innerHTML = '';

        this.routes.forEach(route => {
            const activeVehicles = Array.from(this.vehicles.values())
                .filter(v => v.routeId === route.id).length;

            const item = document.createElement('div');
            item.className = 'route-item';
            item.innerHTML = `
                <div class="route-header">
                    <span class="route-number">${route.number}</span>
                    <span class="route-status on-time">${activeVehicles} active</span>
                </div>
                <div class="route-details">${route.name}</div>
            `;
            routeList.appendChild(item);
        });
    }

    // Load arrivals list
    loadArrivalsList() {
        const arrivalsList = document.getElementById('arrivalsList');
        arrivalsList.innerHTML = '';

        const arrivals = this.generateMockArrivals();
        
        arrivals.forEach(arrival => {
            const item = document.createElement('div');
            item.className = 'arrival-item';
            item.innerHTML = `
                <div>
                    <div class="arrival-time">${arrival.time}</div>
                    <div class="route-details">${arrival.route} to ${arrival.destination}</div>
                </div>
                <div class="route-status ${arrival.status}">${arrival.status}</div>
            `;
            arrivalsList.appendChild(item);
        });
    }

    // Generate mock arrivals
    generateMockArrivals() {
        const arrivals = [];
        const now = new Date();
        
        this.routes.forEach(route => {
            const baseTime = new Date(now.getTime() + Math.random() * 30 * 60000);
            arrivals.push({
                time: baseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                route: route.number,
                destination: route.stops[route.stops.length - 1].name,
                status: Math.random() > 0.8 ? 'delayed' : 'on-time'
            });
        });

        return arrivals.sort((a, b) => new Date(a.time) - new Date(b.time)).slice(0, 5);
    }

    // Load stops list
    loadStopsList() {
        const stopsList = document.getElementById('stopsList');
        stopsList.innerHTML = '';

        if (this.userLocation) {
            const nearbyStops = this.findNearbyStops();
            nearbyStops.forEach(stop => {
                const item = document.createElement('div');
                item.className = 'stop-item';
                item.innerHTML = `
                    <div>
                        <div class="route-details">${stop.name}</div>
                        <div class="stop-distance">${stop.distance.toFixed(1)} km away</div>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                `;
                stopsList.appendChild(item);
            });
        } else {
            stopsList.innerHTML = '<div class="text-muted">Enable location to see nearby stops</div>';
        }
    }

    // Find nearby stops
    findNearbyStops() {
        if (!this.userLocation) return [];

        const nearby = [];
        this.stops.forEach(stop => {
            const distance = this.calculateDistance(
                this.userLocation[0], this.userLocation[1],
                stop.lat, stop.lng
            );
            if (distance <= 2) {
                nearby.push({ ...stop, distance });
            }
        });

        return nearby.sort((a, b) => a.distance - b.distance).slice(0, 5);
    }

    // Calculate distance between two points
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Login System Methods
    switchLoginTab(tabName) {
        // Remove active class from all tabs and panels
        document.querySelectorAll('.login-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.login-panel').forEach(panel => panel.classList.remove('active'));

        // Add active class to selected tab and panel
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Panel`).classList.add('active');
    }

    // Registration System Methods
    showRegistrationModal() {
        document.getElementById('registerModal').classList.add('active');
    }

    hideRegistrationModal() {
        document.getElementById('registerModal').classList.remove('active');
        this.resetRegistrationForms();
    }

    switchRegisterTab(registerType) {
        // Remove active class from all register tabs and panels
        document.querySelectorAll('.register-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.register-panel').forEach(panel => panel.classList.remove('active'));

        // Add active class to selected tab and panel
        document.querySelector(`[data-register="${registerType}"]`).classList.add('active');
        document.getElementById(`${registerType}RegisterPanel`).classList.add('active');
    }



    handleUserRegistration() {
        const name = document.getElementById('regUserName').value;
        const email = document.getElementById('regUserEmail').value;
        const mobile = document.getElementById('regUserMobile').value;
        const password = document.getElementById('regUserPassword').value;
        const confirmPassword = document.getElementById('regUserConfirmPassword').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;

        // Validation
        if (!name || !email || !mobile || !password || !confirmPassword) {
            this.showError('Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.showError('Password must be at least 6 characters long');
            return;
        }

        if (!agreeTerms) {
            this.showError('Please agree to the Terms & Conditions');
            return;
        }

        // Check if user already exists
        const existingUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
        const userExists = existingUsers.find(user => user.email === email);
        
        if (userExists) {
            this.showError('User with this email already exists');
            return;
        }

        // Create new user
        const newUser = {
            id: 'user_' + Date.now(),
            type: 'user',
            name: name,
            email: email,
            mobile: mobile,
            password: password, // In real app, this should be hashed
            createdAt: new Date().toISOString()
        };

        // Save to localStorage
        existingUsers.push(newUser);
        localStorage.setItem('registeredUsers', JSON.stringify(existingUsers));

        this.showSuccess('Account created successfully! You can now login.');
        this.hideRegistrationModal();
    }

    handleDriverRegistration() {
        const name = document.getElementById('regDriverName').value;
        const email = document.getElementById('regDriverEmail').value;
        const mobile = document.getElementById('regDriverMobile').value;
        const license = document.getElementById('regDriverLicense').value;
        const experience = document.getElementById('regDriverExperience').value;
        const password = document.getElementById('regDriverPassword').value;
        const confirmPassword = document.getElementById('regDriverConfirmPassword').value;
        const agreeTerms = document.getElementById('agreeDriverTerms').checked;

        // Validation
        if (!name || !email || !mobile || !license || !experience || !password || !confirmPassword) {
            this.showError('Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.showError('Password must be at least 6 characters long');
            return;
        }

        if (!agreeTerms) {
            this.showError('Please agree to the Terms & Conditions');
            return;
        }

        // Check if driver already exists
        const existingDrivers = JSON.parse(localStorage.getItem('registeredDrivers') || '[]');
        const driverExists = existingDrivers.find(driver => driver.email === email || driver.license === license);
        
        if (driverExists) {
            this.showError('Driver with this email or license already exists');
            return;
        }

        // Create new driver
        const newDriver = {
            id: 'driver_' + Date.now(),
            type: 'driver',
            name: name,
            email: email,
            mobile: mobile,
            license: license,
            experience: experience,
            password: password, // In real app, this should be hashed
            status: 'pending', // pending, approved, rejected
            createdAt: new Date().toISOString()
        };

        // Save to localStorage
        existingDrivers.push(newDriver);
        localStorage.setItem('registeredDrivers', JSON.stringify(existingDrivers));

        this.showSuccess('Driver registration submitted successfully! Your account will be reviewed by admin.');
        this.hideRegistrationModal();
    }

    resetRegistrationForms() {
        // Reset all registration form inputs
        document.querySelectorAll('#registerModal input').forEach(input => {
            input.value = '';
        });
        
        // Reset checkboxes
        document.querySelectorAll('#registerModal input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Reset select
        document.getElementById('regDriverExperience').value = '';
    }

    switchMethodTab(method) {
        // Remove active class from all method tabs and content
        document.querySelectorAll('.method-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.method-content').forEach(content => content.classList.remove('active'));

        // Add active class to selected method tab and content
        document.querySelector(`[data-method="${method}"]`).classList.add('active');
        document.getElementById(`${method}Method`).classList.add('active');
    }

    handleUserLogin(method) {
        let email, password, mobile, otp;

        switch(method) {
            case 'email':
                email = document.getElementById('userEmail').value;
                password = document.getElementById('userPassword').value;
                if (!email || !password) {
                    this.showError('Please fill in all fields');
                    return;
                }
                break;
            case 'mobile':
                mobile = document.getElementById('userMobile').value;
                otp = document.getElementById('userOTP').value;
                if (!mobile || !otp) {
                    this.showError('Please fill in all fields');
                    return;
                }
                break;
            case 'social':
                email = document.getElementById('socialEmail').value;
                if (!email) {
                    this.showError('Please enter your email');
                    return;
                }
                break;
        }

        // Check registered users first
        const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
        
        if (method === 'email') {
            const user = registeredUsers.find(u => u.email === email && u.password === password);
            if (user) {
                this.loginSuccess({
                    type: 'user',
                    name: user.name,
                    email: user.email,
                    method: method,
                    id: user.id
                });
                return;
            }
        }

        // Demo login validation (fallback)
        if (method === 'email' && email === 'user@demo.com' && password === 'password123') {
            this.loginSuccess({
                type: 'user',
                name: 'Demo User',
                email: email,
                method: method
            });
        } else if (method === 'mobile' && mobile === '1234567890' && otp === '123456') {
            this.loginSuccess({
                type: 'user',
                name: 'Mobile User',
                email: `${mobile}@mobile.com`,
                method: method
            });
        } else if (method === 'social' && email) {
            this.loginSuccess({
                type: 'user',
                name: 'Social User',
                email: email,
                method: method
            });
        } else {
            this.showError('Invalid credentials. Please check your email and password or register a new account.');
        }
    }

    handleDriverLogin() {
        const busNumber = document.getElementById('busNumber').value;
        const driverName = document.getElementById('driverName').value;
        const password = document.getElementById('driverPassword').value;

        if (!busNumber || !driverName || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        // Check registered drivers first
        const registeredDrivers = JSON.parse(localStorage.getItem('registeredDrivers') || '[]');
        const driver = registeredDrivers.find(d => 
            d.name === driverName && 
            d.password === password && 
            d.status === 'approved'
        );

        if (driver) {
            this.loginSuccess({
                type: 'driver',
                name: driver.name,
                email: driver.email,
                license: driver.license,
                experience: driver.experience,
                id: driver.id
            });
            return;
        }

        // Demo driver validation (fallback)
        if (busNumber === 'BUS-001' && driverName === 'John Driver' && password === 'driver123') {
            this.loginSuccess({
                type: 'driver',
                name: driverName,
                busNumber: busNumber,
                route: 'Route 101 - Downtown Express'
            });
        } else {
            this.showError('Invalid driver credentials or account not approved. Please check your details or contact admin.');
        }
    }

    handleAdminLogin() {
        const username = document.getElementById('adminUsername').value;
        const password = document.getElementById('adminPassword').value;
        const code = document.getElementById('adminCode').value;

        if (!username || !password) {
            this.showError('Please fill in username and password');
            return;
        }

        // Demo admin validation
        if (username === 'admin' && password === 'admin123') {
            this.loginSuccess({
                type: 'admin',
                name: 'System Administrator',
                username: username,
                permissions: ['manage_routes', 'manage_vehicles', 'view_analytics']
            });
        } else {
            this.showError('Invalid admin credentials. Use: admin / admin123');
        }
    }



    // Right side sign-in handlers
    toggleRightSignIn() {
        const panel = document.querySelector('.right-signin-panel');
        const toggleBtn = document.getElementById('signinToggleBtn');
        const icon = toggleBtn.querySelector('i');
        
        if (panel.classList.contains('active')) {
            panel.classList.remove('active');
            icon.className = 'fas fa-sign-in-alt';
            toggleBtn.style.right = '0';
        } else {
            panel.classList.add('active');
            icon.className = 'fas fa-times';
            toggleBtn.style.right = '500px';
        }
    }

    switchRightSignInTab(signinType) {
        // Remove active class from all tabs and panels
        document.querySelectorAll('.signin-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.signin-panel').forEach(panel => panel.classList.remove('active'));

        // Add active class to selected tab and panel
        document.querySelector(`[data-signin="${signinType}"]`).classList.add('active');
        document.getElementById(`right${signinType.charAt(0).toUpperCase() + signinType.slice(1)}Panel`).classList.add('active');
    }

    handleRightUserLogin() {
        const email = document.getElementById('rightUserEmail').value;
        const password = document.getElementById('rightUserPassword').value;

        if (!email || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        // Check registered users first
        const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
        const user = registeredUsers.find(u => u.email === email && u.password === password);
        
        if (user) {
            this.loginSuccess({
                type: 'user',
                name: user.name,
                email: user.email,
                method: 'right-panel',
                id: user.id
            });
            return;
        }

        // Demo login validation (fallback)
        if (email === 'user@demo.com' && password === 'password123') {
            this.loginSuccess({
                type: 'user',
                name: 'Demo User',
                email: email,
                method: 'right-panel'
            });
        } else {
            this.showError('Invalid credentials. Please check your email and password.');
        }
    }

    handleRightDriverLogin() {
        const driverName = document.getElementById('rightDriverName').value;
        const password = document.getElementById('rightDriverPassword').value;

        if (!driverName || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        // Check registered drivers first
        const registeredDrivers = JSON.parse(localStorage.getItem('registeredDrivers') || '[]');
        const driver = registeredDrivers.find(d => 
            d.name === driverName && 
            d.password === password && 
            d.status === 'approved'
        );

        if (driver) {
            this.loginSuccess({
                type: 'driver',
                name: driver.name,
                email: driver.email,
                license: driver.license,
                experience: driver.experience,
                id: driver.id
            });
            return;
        }

        // Demo driver validation (fallback)
        if (driverName === 'John Driver' && password === 'driver123') {
            this.loginSuccess({
                type: 'driver',
                name: driverName,
                busNumber: 'BUS-001',
                route: 'Route 101 - Downtown Express'
            });
        } else {
            this.showError('Invalid driver credentials or account not approved.');
        }
    }

    handleRightAdminLogin() {
        const username = document.getElementById('rightAdminUsername').value;
        const password = document.getElementById('rightAdminPassword').value;

        if (!username || !password) {
            this.showError('Please fill in username and password');
            return;
        }

        // Demo admin validation
        if (username === 'admin' && password === 'admin123') {
            this.loginSuccess({
                type: 'admin',
                name: 'System Administrator',
                username: username,
                permissions: ['manage_routes', 'manage_vehicles', 'view_analytics']
            });
        } else {
            this.showError('Invalid admin credentials. Use: admin / admin123');
        }
    }

    sendOTP() {
        const mobile = document.getElementById('userMobile').value;
        if (!mobile) {
            this.showError('Please enter your mobile number');
            return;
        }

        // Simulate OTP sending
        this.showSuccess('OTP sent to your mobile number');
        document.getElementById('userOTP').focus();
    }

    handleSocialLogin(provider) {
        // Simulate social login
        this.showSuccess(`Redirecting to ${provider}...`);
        setTimeout(() => {
            this.loginSuccess({
                type: 'user',
                name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
                email: `user@${provider}.com`,
                method: provider
            });
        }, 1500);
    }

    loginSuccess(userData) {
        this.currentUser = userData;
        this.userType = userData.type;
        
        // Save to localStorage
        localStorage.setItem('currentUser', JSON.stringify(userData));
        
        this.showSuccess(`Welcome, ${userData.name}!`);
        
        setTimeout(() => {
            this.showApplication();
        }, 1000);
    }

    showApplication() {
        // Hide login container
        document.getElementById('loginContainer').classList.add('hidden');
        
        // Show app container
        document.getElementById('appContainer').classList.remove('hidden');
        
        // Update user info in header
        document.getElementById('currentUser').textContent = `Welcome, ${this.currentUser.name}`;
        
        // Initialize the application
        this.initializeApp();
    }

    async initializeApp() {
        this.showLoading();
        await this.initializeMap();
        this.loadMockData();
        this.startRealTimeUpdates();
        this.hideLoading();
        this.updateLastUpdate();
    }

    logout() {
        // Clear user data
        this.currentUser = null;
        this.userType = null;
        localStorage.removeItem('currentUser');
        
        // Stop updates
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        // Stop Punjab GPS tracking
        if (this.punjabTrackingInterval) {
            clearInterval(this.punjabTrackingInterval);
            this.punjabTrackingInterval = null;
        }
        this.isPunjabTracking = false;
        
        // Hide app container
        document.getElementById('appContainer').classList.add('hidden');
        
        // Show login container
        document.getElementById('loginContainer').classList.remove('hidden');
        
        // Reset forms
        this.resetForms();
        
        this.showSuccess('Logged out successfully');
    }

    resetForms() {
        // Reset all form inputs
        document.querySelectorAll('input').forEach(input => {
            input.value = '';
        });
        
        // Reset checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    showError(message) {
        // Create error notification
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        `;
        this.showNotification(notification);
    }

    showSuccess(message) {
        // Create success notification
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        `;
        this.showNotification(notification);
    }

    showNotification(notification) {
        // Add notification styles if not already added
        if (!document.getElementById('notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 8px;
                    color: white;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    z-index: 10000;
                    animation: slideInRight 0.3s ease;
                }
                .notification.error {
                    background: rgba(239, 68, 68, 0.9);
                    border: 1px solid #dc2626;
                }
                .notification.success {
                    background: rgba(34, 197, 94, 0.9);
                    border: 1px solid #16a34a;
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Update last update time
    updateLastUpdate() {
        const now = new Date();
        document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
    }

    // Show loading overlay
    showLoading() {
        document.getElementById('loadingOverlay').classList.add('active');
    }

    // Hide loading overlay
    hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    // Center map on user location
    centerMap() {
        if (this.userLocation && this.map) {
            this.map.setView(this.userLocation, 12);
        } else {
            this.getUserLocation();
        }
    }

    // Toggle fullscreen mode
    toggleFullscreen() {
        const mapContainer = document.querySelector('.map-container');
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        
        if (!document.fullscreenElement) {
            // Enter fullscreen
            if (mapContainer.requestFullscreen) {
                mapContainer.requestFullscreen();
            } else if (mapContainer.webkitRequestFullscreen) {
                mapContainer.webkitRequestFullscreen();
            } else if (mapContainer.mozRequestFullScreen) {
                mapContainer.mozRequestFullScreen();
            } else if (mapContainer.msRequestFullscreen) {
                mapContainer.msRequestFullscreen();
            }
            
            fullscreenBtn.classList.add('fullscreen-active');
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Exit Fullscreen';
            
            // Trigger map resize after entering fullscreen
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 100);
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            
            fullscreenBtn.classList.remove('fullscreen-active');
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Fullscreen';
            
            // Trigger map resize after exiting fullscreen
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 100);
        }
    }

    // Handle fullscreen change
    handleFullscreenChange() {
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        
        if (isFullscreen) {
            fullscreenBtn.classList.add('fullscreen-active');
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Exit Fullscreen';
        } else {
            fullscreenBtn.classList.remove('fullscreen-active');
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Fullscreen';
        }
        
        // Trigger map resize
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
            }
        }, 100);
    }

    // Show report issue modal
    showReportIssueModal() {
        const issue = prompt('Please describe the issue you encountered:');
        if (issue && issue.trim()) {
            this.feedback.push({
                id: Date.now(),
                user: this.currentUser?.name || 'Anonymous',
                issue: issue.trim(),
                timestamp: new Date().toISOString(),
                status: 'pending'
            });
            localStorage.setItem('feedback', JSON.stringify(this.feedback));
            this.showSuccess('Issue reported successfully. Thank you for your feedback!');
        }
    }

    // Refresh dashboard data
    refreshDashboard() {
        this.loadDashboardData();
        this.updateUI();
    }

    // Load schedule list
    loadScheduleList() {
        const scheduleList = document.getElementById('scheduleList');
        scheduleList.innerHTML = '';

        const schedules = this.generateMockSchedules();
        
        schedules.forEach(schedule => {
            const item = document.createElement('div');
            item.className = 'schedule-item';
            item.innerHTML = `
                <div>
                    <div class="schedule-time">${schedule.time}</div>
                    <div class="schedule-route">${schedule.route}</div>
                </div>
                <div class="route-status ${schedule.status}">${schedule.status}</div>
            `;
            scheduleList.appendChild(item);
        });
    }

    // Generate mock schedules
    generateMockSchedules() {
        const schedules = [];
        const now = new Date();
        
        this.routes.forEach(route => {
            for (let i = 0; i < 3; i++) {
                const baseTime = new Date(now.getTime() + (i + 1) * 30 * 60000);
                schedules.push({
                    time: baseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    route: `${route.number} - ${route.name}`,
                    status: Math.random() > 0.8 ? 'delayed' : 'on-time'
                });
            }
        });

        return schedules.sort((a, b) => new Date(a.time) - new Date(b.time)).slice(0, 8);
    }

    // Load favorites list
    loadFavoritesList() {
        const favoritesList = document.getElementById('favoritesList');
        favoritesList.innerHTML = '';

        if (this.favorites.length === 0) {
            favoritesList.innerHTML = '<div class="text-muted">No favorite routes yet</div>';
            return;
        }

        this.favorites.forEach(favorite => {
            const route = this.routes.get(favorite.routeId);
            if (route) {
                const item = document.createElement('div');
                item.className = 'favorite-item';
                item.innerHTML = `
                    <div>
                        <div class="route-number">${route.number}</div>
                        <div class="schedule-route">${route.name}</div>
                    </div>
                    <i class="fas fa-heart" style="color: #f87171;"></i>
                `;
                favoritesList.appendChild(item);
            }
        });
    }

    // Load alerts list
    loadAlertsList() {
        const alertsList = document.getElementById('alertsList');
        alertsList.innerHTML = '';

        const alerts = this.generateMockAlerts();
        
        alerts.forEach(alert => {
            const item = document.createElement('div');
            item.className = `alert-item ${alert.type}`;
            item.innerHTML = `
                <div>
                    <div class="route-details">${alert.title}</div>
                    <div class="stop-distance">${alert.description}</div>
                </div>
                <div class="route-status ${alert.type}">${alert.type}</div>
            `;
            alertsList.appendChild(item);
        });
    }

    // Generate mock alerts
    generateMockAlerts() {
        return [
            {
                title: 'Route 101 Delayed',
                description: 'Due to traffic congestion',
                type: 'warning'
            },
            {
                title: 'Route 202 Service Update',
                description: 'Normal service resumed',
                type: 'info'
            },
            {
                title: 'Route 303 Cancelled',
                description: 'Due to mechanical issues',
                type: 'error'
            }
        ];
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new CityBusTracker();
});

// ---------------- Ticket Booking Feature ----------------
CityBusTracker.prototype.setupTicketBooking = function() {
    // State
    this.selectedRouteId = null;
    this.selectedFromStopId = null;
    this.selectedToStopId = null;
    this.selectedSeatType = 'general';
    this.passengerFormsState = []; // {name, mobile, seat}
    this.selectedSeats = new Set();

    // Open/close modal
    const openBtn = document.getElementById('bookTicketBtn');
    const closeBtn = document.getElementById('closeTicketBtn');
    const cancelBtn = document.getElementById('cancelTicketBtn');
    const confirmBtn = document.getElementById('confirmBookingBtn');

    if (openBtn) openBtn.addEventListener('click', () => this.showTicketModal());
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideTicketModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideTicketModal());
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.processBooking());

    // Journey form listeners
    const passengerCountEl = document.getElementById('passengerCount');
    const seatTypeEl = document.getElementById('seatType');
    const dateEl = document.getElementById('journeyDate');
    const timeEl = document.getElementById('journeyTime');
    const fromEl = document.getElementById('fromStop');
    const toEl = document.getElementById('toStop');

    if (passengerCountEl) passengerCountEl.addEventListener('change', () => {
        this.updatePassengerForms();
        this.updateFare();
        this.updateBookingSummary();
    });
    if (seatTypeEl) seatTypeEl.addEventListener('change', (e) => {
        this.selectedSeatType = e.target.value;
        this.updateFare();
        this.updateBookingSummary();
    });
    if (dateEl) dateEl.addEventListener('change', () => this.updateBookingSummary());
    if (timeEl) timeEl.addEventListener('change', () => this.updateBookingSummary());
    if (fromEl) fromEl.addEventListener('change', (e) => { this.selectedFromStopId = e.target.value; this.updateBookingSummary(); });
    if (toEl) toEl.addEventListener('change', (e) => { this.selectedToStopId = e.target.value; this.updateBookingSummary(); });

    // Payment tab listeners
    document.querySelectorAll('.payment-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const method = e.currentTarget.dataset.method;
            document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.payment-content').forEach(c => c.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const content = document.getElementById(method + 'Payment');
            if (content) content.classList.add('active');
        });
    });

    // Wallet options
    document.querySelectorAll('.wallet-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.wallet-option').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
    });
};

CityBusTracker.prototype.showTicketModal = function() {
    const modal = document.getElementById('ticketModal');
    if (!modal) return;
    modal.classList.add('active');

    // Initialize booking system
    this.setupBookingSystem();

    // Set min date to today
    const dateEl = document.getElementById('journeyDate');
    if (dateEl) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateEl.min = `${yyyy}-${mm}-${dd}`;
        if (!dateEl.value) dateEl.value = `${yyyy}-${mm}-${dd}`;
    }

    this.populateRoutesInModal();
    this.loadAvailableBuses();
    this.updatePassengerForms();
    this.updateFare();
    this.updateBookingSummary();
};

CityBusTracker.prototype.hideTicketModal = function() {
    const modal = document.getElementById('ticketModal');
    if (!modal) return;
    modal.classList.remove('active');
};

CityBusTracker.prototype.populateRoutesInModal = function() {
    const container = document.getElementById('routeSelection');
    if (!container) return;
    container.innerHTML = '';

    const basePrice = 50; // default base fare per passenger
    this.routes.forEach(route => {
        const stopsText = route.stops.map(s => s.name).join(' • ');
        const card = document.createElement('div');
        card.className = 'route-card';
        card.dataset.id = route.id;
        card.innerHTML = `
            <div class="route-info">
                <div class="route-number">${route.number}</div>
                <div class="route-name">${route.name}</div>
                <div class="route-stops">${stopsText}</div>
            </div>
            <div class="route-price">
                <span class="price">₹${basePrice}</span>
                <span class="duration">per passenger</span>
            </div>
        `;
        card.addEventListener('click', () => {
            document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.selectedRouteId = route.id;
            this.populateStopsForSelectedRoute();
            this.updateFare();
            this.updateBookingSummary();
        });
        container.appendChild(card);
    });
};

CityBusTracker.prototype.populateStopsForSelectedRoute = function() {
    const fromEl = document.getElementById('fromStop');
    const toEl = document.getElementById('toStop');
    if (!fromEl || !toEl) return;
    fromEl.innerHTML = '<option value="">Select departure stop</option>';
    toEl.innerHTML = '<option value="">Select destination stop</option>';

    const route = this.routes.get(this.selectedRouteId);
    if (!route) return;

    route.stops.forEach(stop => {
        const opt1 = document.createElement('option');
        opt1.value = stop.id;
        opt1.textContent = stop.name;
        fromEl.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = stop.id;
        opt2.textContent = stop.name;
        toEl.appendChild(opt2);
    });
};

CityBusTracker.prototype.updatePassengerForms = function() {
    const container = document.getElementById('passengerDetails');
    const countEl = document.getElementById('passengerCount');
    if (!container || !countEl) return;

    const count = parseInt(countEl.value || '1', 10);
    // Resize state
    const oldState = this.passengerFormsState.slice(0);
    this.passengerFormsState = new Array(count).fill(null).map((_, i) => oldState[i] || { name: '', mobile: '', seat: '' });
    this.selectedSeats = new Set(this.passengerFormsState.map(p => p.seat).filter(Boolean));

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'passenger-form';
        wrapper.innerHTML = `
            <h5>Passenger ${i + 1}</h5>
            <div class="form-row">
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" data-idx="${i}" data-field="name" placeholder="Enter full name" />
                </div>
                <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="tel" data-idx="${i}" data-field="mobile" placeholder="Enter mobile number" />
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Select Seat</label>
                    <select data-idx="${i}" data-field="seat"></select>
                </div>
            </div>
        `;

        container.appendChild(wrapper);
    }

    // Fill existing values and populate seat options
    container.querySelectorAll('input, select').forEach(el => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        const field = el.getAttribute('data-field');
        if (field === 'seat' && el.tagName === 'SELECT') {
            this.populateSeatOptionsForSelect(el);
            if (this.passengerFormsState[idx].seat) el.value = this.passengerFormsState[idx].seat;
        } else if (field && field in this.passengerFormsState[idx]) {
            el.value = this.passengerFormsState[idx][field] || '';
        }
        el.addEventListener('input', (e) => this.handlePassengerFieldChange(e));
        el.addEventListener('change', (e) => this.handlePassengerFieldChange(e));
    });
};

CityBusTracker.prototype.populateSeatOptionsForSelect = function(selectEl) {
    // Simple mock: seats 1-40, prevent duplicate selections
    const currentValue = selectEl.value;
    selectEl.innerHTML = '<option value="">Select seat</option>';
    for (let s = 1; s <= 40; s++) {
        const value = String(s);
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = `Seat ${value}`;
        if (this.selectedSeats.has(value) && value !== currentValue) {
            opt.disabled = true;
        }
        selectEl.appendChild(opt);
    }
};

CityBusTracker.prototype.handlePassengerFieldChange = function(e) {
    const el = e.currentTarget;
    const idx = parseInt(el.getAttribute('data-idx'), 10);
    const field = el.getAttribute('data-field');
    const value = el.value;
    if (Number.isNaN(idx) || !field) return;

    if (field === 'seat') {
        // Update seat selections ensuring uniqueness
        const prev = this.passengerFormsState[idx].seat;
        if (prev) this.selectedSeats.delete(prev);
        if (value) this.selectedSeats.add(value);
        this.passengerFormsState[idx].seat = value;

        // Refresh all seat selects to reflect disabled options
        document.querySelectorAll('#passengerDetails select[data-field="seat"]').forEach(sel => this.populateSeatOptionsForSelect(sel));
        // Restore current selections
        document.querySelectorAll('#passengerDetails select[data-field="seat"]').forEach((sel, i) => {
            const seatVal = this.passengerFormsState[i]?.seat || '';
            if (seatVal) sel.value = seatVal;
        });
    } else {
        this.passengerFormsState[idx][field] = value;
    }

    this.updateBookingSummary();
};

CityBusTracker.prototype.updateFare = function() {
    // Base fare per passenger
    const basePerPassenger = 50;
    const seatType = this.selectedSeatType || 'general';
    const passengerCount = parseInt(document.getElementById('passengerCount')?.value || '1', 10);

    let seatUpgradePerPassenger = 0;
    if (seatType === 'premium') seatUpgradePerPassenger = 50;
    if (seatType === 'luxury') seatUpgradePerPassenger = 100;

    const baseTotal = basePerPassenger * passengerCount;
    const upgradeTotal = seatUpgradePerPassenger * passengerCount;
    const subtotal = baseTotal + upgradeTotal;
    const taxes = Math.round(subtotal * 0.05); // 5%
    const total = subtotal + taxes;

    const fmt = (n) => `₹${n}`;
    const baseFareEl = document.getElementById('baseFare');
    const seatUpgradeEl = document.getElementById('seatUpgrade');
    const taxesEl = document.getElementById('taxes');
    const totalFareEl = document.getElementById('totalFare');
    if (baseFareEl) baseFareEl.textContent = fmt(baseTotal);
    if (seatUpgradeEl) seatUpgradeEl.textContent = fmt(upgradeTotal);
    if (taxesEl) taxesEl.textContent = fmt(taxes);
    if (totalFareEl) totalFareEl.textContent = fmt(total);

    this.currentFare = { baseTotal, upgradeTotal, taxes, total };
};

CityBusTracker.prototype.updateBookingSummary = function() {
    const summary = document.getElementById('bookingSummary');
    if (!summary) return;
    summary.innerHTML = '';

    const route = this.routes.get(this.selectedRouteId) || null;
    const fromStop = route?.stops.find(s => s.id === this.selectedFromStopId);
    const toStop = route?.stops.find(s => s.id === this.selectedToStopId);
    const date = document.getElementById('journeyDate')?.value || '';
    const time = document.getElementById('journeyTime')?.value || '';
    const seatType = this.selectedSeatType || 'general';

    const addRow = (label, value, isTotal = false) => {
        const div = document.createElement('div');
        div.className = 'summary-item' + (isTotal ? ' total' : '');
        div.innerHTML = `<span>${label}</span><span>${value}</span>`;
        summary.appendChild(div);
    };

    if (route) addRow('Route', `${route.number} - ${route.name}`);
    if (fromStop) addRow('From', fromStop.name);
    if (toStop) addRow('To', toStop.name);
    if (date) addRow('Date', date);
    if (time) addRow('Time', time);
    addRow('Seat Type', seatType.charAt(0).toUpperCase() + seatType.slice(1));

    // Passenger list
    if (this.passengerFormsState.length) {
        this.passengerFormsState.forEach((p, i) => {
            addRow(`Passenger ${i + 1}`, `${p.name || '-'} (${p.mobile || '-'}) — Seat ${p.seat || '-'}`);
        });
    }

    // Fare
    if (this.currentFare) addRow('Total Fare', `₹${this.currentFare.total}`, true);
};

CityBusTracker.prototype.confirmTicketBooking = function() {
    // Basic validation
    if (!this.selectedRouteId) return this.showError('Please select a route');
    if (!this.selectedFromStopId || !this.selectedToStopId) return this.showError('Please select From and To stops');
    const date = document.getElementById('journeyDate')?.value;
    const time = document.getElementById('journeyTime')?.value;
    if (!date || !time) return this.showError('Please select date and time');

    for (let i = 0; i < this.passengerFormsState.length; i++) {
        const p = this.passengerFormsState[i];
        if (!p.name || !p.mobile || !p.seat) {
            return this.showError(`Please complete details for Passenger ${i + 1}`);
        }
    }

    // Simulate booking success
    this.showSuccess('Ticket booked successfully!');

    // Optionally save to localStorage (mock)
    const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');
    bookings.push({
        id: 'bk_' + Date.now(),
        routeId: this.selectedRouteId,
        fromStopId: this.selectedFromStopId,
        toStopId: this.selectedToStopId,
        date,
        time,
        seatType: this.selectedSeatType,
        passengers: this.passengerFormsState,
        fare: this.currentFare
    });
    localStorage.setItem('bookings', JSON.stringify(bookings));

    this.hideTicketModal();
};

// ---------------- Tickets Feature ----------------
CityBusTracker.prototype.setupTicketsFeature = function() {
    const close1 = document.getElementById('closeTicketDetailsBtn');
    const close2 = document.getElementById('closeTicketDetailsBtn2');
    if (close1) close1.addEventListener('click', () => this.hideTicketDetails());
    if (close2) close2.addEventListener('click', () => this.hideTicketDetails());
};

// ---------------- Feedback Feature ----------------
CityBusTracker.prototype.setupFeedbackFeature = function() {
    // Star rating interactions
    const starWrap = document.getElementById('starRating');
    if (starWrap) {
        starWrap.querySelectorAll('i').forEach(star => {
            star.addEventListener('mouseenter', (e) => {
                const val = parseInt(e.currentTarget.dataset.rate, 10);
                starWrap.querySelectorAll('i').forEach((s, i) => {
                    s.classList.toggle('active', i < val);
                    s.classList.toggle('fas', i < val);
                    s.classList.toggle('far', i >= val);
                });
            });
            star.addEventListener('click', (e) => {
                const val = parseInt(e.currentTarget.dataset.rate, 10);
                starWrap.dataset.value = String(val);
            });
        });
        starWrap.addEventListener('mouseleave', () => {
            const current = parseInt(starWrap.dataset.value || '0', 10);
            starWrap.querySelectorAll('i').forEach((s, i) => {
                s.classList.toggle('active', i < current);
                s.classList.toggle('fas', i < current);
                s.classList.toggle('far', i >= current);
            });
        });
    }

    // Submit feedback
    const form = document.getElementById('feedbackForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const busId = document.getElementById('feedbackBus').value;
            const rating = parseInt(document.getElementById('starRating').dataset.value || '0', 10);
            const text = document.getElementById('feedbackText').value.trim();
            if (!busId || !rating) {
                this.showError('Please select a bus and rating');
                return;
            }
            const entry = {
                id: 'fb_' + Date.now(),
                busId,
                rating,
                text,
                createdAt: new Date().toISOString()
            };
            this.feedback.push(entry);
            localStorage.setItem('feedback', JSON.stringify(this.feedback));
            this.showSuccess('Thanks for your feedback!');
            document.getElementById('feedbackText').value = '';
            document.getElementById('starRating').dataset.value = '0';
            this.loadFeedbackUI();
        });
    }
};

CityBusTracker.prototype.loadFeedbackUI = function() {
    // Populate bus dropdown
    const busSelect = document.getElementById('feedbackBus');
    if (busSelect) {
        busSelect.innerHTML = '<option value="">Select Bus</option>';
        this.vehicles.forEach((v) => {
            const opt = document.createElement('option');
            opt.value = v.id;
            const route = this.routes.get(v.routeId);
            opt.textContent = `${v.id} ${route ? '— ' + route.number : ''}`;
            busSelect.appendChild(opt);
        });
    }

    // Render feedback list with averages per bus
    const list = document.getElementById('feedbackList');
    if (!list) return;
    list.innerHTML = '';

    // Group by busId
    const byBus = new Map();
    this.feedback.forEach(fb => {
        if (!byBus.has(fb.busId)) byBus.set(fb.busId, []);
        byBus.get(fb.busId).push(fb);
    });

    const buses = Array.from(byBus.keys());
    if (buses.length === 0) {
        list.innerHTML = '<div class="text-muted">No feedback yet</div>';
        return;
    }

    buses.forEach(busId => {
        const items = byBus.get(busId);
        const avg = (items.reduce((s, x) => s + x.rating, 0) / items.length).toFixed(1);
        const container = document.createElement('div');
        container.className = 'feedback-item';
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.innerHTML = `<span>Bus: ${busId}</span><span>Avg: ${avg} ★ (${items.length})</span>`;
        container.appendChild(meta);

        items.slice(-3).reverse().forEach(fb => {
            const text = document.createElement('div');
            text.className = 'text';
            const stars = '★'.repeat(fb.rating) + '☆'.repeat(5 - fb.rating);
            const when = new Date(fb.createdAt).toLocaleString();
            text.innerHTML = `<div>${stars} — <small>${when}</small></div>${fb.text ? fb.text : ''}`;
            container.appendChild(text);
        });

        list.appendChild(container);
    });
};
CityBusTracker.prototype.loadTicketsList = function() {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');
    if (bookings.length === 0) {
        listEl.innerHTML = '<div class="text-muted">No tickets booked yet</div>';
        return;
    }

    bookings
        .sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time))
        .forEach(bk => {
            const route = this.routes.get(bk.routeId);
            const fromStop = route?.stops.find(s => s.id === bk.fromStopId)?.name || '-';
            const toStop = route?.stops.find(s => s.id === bk.toStopId)?.name || '-';
            const item = document.createElement('div');
            item.className = 'ticket-item';
            item.innerHTML = `
                <div class="left">
                    <div class="ticket-route">${route ? route.number + ' - ' + route.name : 'Route'}</div>
                    <div class="ticket-meta">${fromStop} → ${toStop} • ${bk.date} ${bk.time} • ${bk.passengers.length} pax</div>
                </div>
                <div class="ticket-actions">
                    <button class="btn btn-secondary btn-sm btn-outline" data-action="view">View</button>
                </div>
            `;
            item.querySelector('[data-action="view"]').addEventListener('click', () => this.showTicketDetails(bk));
            listEl.appendChild(item);
        });
};

CityBusTracker.prototype.showTicketDetails = function(booking) {
    const modal = document.getElementById('ticketDetailsModal');
    const body = document.getElementById('ticketDetailsBody');
    if (!modal || !body) return;

    const route = this.routes.get(booking.routeId);
    const fromStop = route?.stops.find(s => s.id === booking.fromStopId)?.name || '-';
    const toStop = route?.stops.find(s => s.id === booking.toStopId)?.name || '-';

    const passengersHtml = booking.passengers.map((p, i) => `<div>${i + 1}. ${p.name} (${p.mobile}) — Seat ${p.seat}</div>`).join('');

    body.innerHTML = `
        <div class="ticket-details">
            <div class="detail">
                <h5>Journey</h5>
                <div><strong>Route:</strong> ${route ? route.number + ' - ' + route.name : '-'}</div>
                <div><strong>From:</strong> ${fromStop}</div>
                <div><strong>To:</strong> ${toStop}</div>
                <div><strong>Date:</strong> ${booking.date}</div>
                <div><strong>Time:</strong> ${booking.time}</div>
                <div><strong>Seat Type:</strong> ${booking.seatType}</div>
            </div>
            <div class="detail">
                <h5>Passengers</h5>
                ${passengersHtml}
            </div>
            <div class="detail">
                <h5>Fare</h5>
                <div><strong>Base:</strong> ₹${booking.fare.baseTotal}</div>
                <div><strong>Upgrade:</strong> ₹${booking.fare.upgradeTotal}</div>
                <div><strong>Taxes:</strong> ₹${booking.fare.taxes}</div>
                <div><strong>Total:</strong> ₹${booking.fare.total}</div>
            </div>
        </div>
    `;

    modal.classList.add('active');
};

CityBusTracker.prototype.hideTicketDetails = function() {
    const modal = document.getElementById('ticketDetailsModal');
    if (!modal) return;
    modal.classList.remove('active');
};

// Enhanced Booking System
CityBusTracker.prototype.setupBookingSystem = function() {
    this.selectedRoute = null;
    this.selectedBus = null;
    this.selectedSeats = [];
    this.availableBuses = [];
    this.seatMap = new Map();
    
    // Initialize seat availability (1-50 seats)
    for (let i = 1; i <= 50; i++) {
        this.seatMap.set(i, {
            id: i,
            available: Math.random() > 0.3, // 70% availability
            selected: false
        });
    }
};

CityBusTracker.prototype.loadAvailableBuses = function() {
    const container = document.getElementById('availableBuses');
    if (!container) return;
    
    // Generate sample available buses
    this.availableBuses = [
        {
            id: 'bus-001',
            number: 'PB-001',
            route: 'Amritsar - Chandigarh',
            departure: '08:00',
            arrival: '12:00',
            price: 250,
            seats: 45,
            type: 'AC'
        },
        {
            id: 'bus-002',
            number: 'PB-002',
            route: 'Amritsar - Chandigarh',
            departure: '14:00',
            arrival: '18:00',
            price: 200,
            seats: 38,
            type: 'Non-AC'
        },
        {
            id: 'bus-003',
            number: 'PB-003',
            route: 'Amritsar - Chandigarh',
            departure: '20:00',
            arrival: '00:00',
            price: 300,
            seats: 42,
            type: 'Luxury'
        }
    ];
    
    container.innerHTML = '';
    this.availableBuses.forEach(bus => {
        const busCard = document.createElement('div');
        busCard.className = 'bus-card';
        busCard.dataset.busId = bus.id;
        busCard.innerHTML = `
            <div class="bus-info">
                <div class="bus-number">${bus.number}</div>
                <div class="bus-route">${bus.route}</div>
                <div class="bus-timing">${bus.departure} - ${bus.arrival} (${bus.type})</div>
            </div>
            <div class="bus-price">
                <span class="price">₹${bus.price}</span>
                <span class="duration">${bus.seats} seats available</span>
            </div>
        `;
        
        busCard.addEventListener('click', () => this.selectBus(bus.id));
        container.appendChild(busCard);
    });
};

CityBusTracker.prototype.selectBus = function(busId) {
    // Remove active class from all bus cards
    document.querySelectorAll('.bus-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Add active class to selected bus
    const selectedCard = document.querySelector(`[data-bus-id="${busId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('active');
    }
    
    this.selectedBus = this.availableBuses.find(bus => bus.id === busId);
    this.generateSeatMap();
};

CityBusTracker.prototype.generateSeatMap = function() {
    const seatMapContainer = document.getElementById('seatMap');
    if (!seatMapContainer) return;
    
    seatMapContainer.innerHTML = '';
    
    // Generate 50 seats in a 10x5 grid
    for (let i = 1; i <= 50; i++) {
        const seatElement = document.createElement('div');
        seatElement.className = 'seat';
        seatElement.dataset.seatNumber = i;
        
        const seatData = this.seatMap.get(i);
        if (seatData.available) {
            seatElement.classList.add('seat-available');
        } else {
            seatElement.classList.add('seat-occupied');
        }
        
        seatElement.textContent = i;
        seatElement.addEventListener('click', () => this.selectSeat(i));
        seatMapContainer.appendChild(seatElement);
    }
};

CityBusTracker.prototype.selectSeat = function(seatNumber) {
    const seatElement = document.querySelector(`[data-seat-number="${seatNumber}"]`);
    const seatData = this.seatMap.get(seatNumber);
    
    if (!seatData.available) return; // Can't select occupied seats
    
    if (seatData.selected) {
        // Deselect seat
        seatData.selected = false;
        seatElement.classList.remove('seat-selected');
        seatElement.classList.add('seat-available');
        this.selectedSeats = this.selectedSeats.filter(s => s !== seatNumber);
    } else {
        // Select seat
        seatData.selected = true;
        seatElement.classList.remove('seat-available');
        seatElement.classList.add('seat-selected');
        this.selectedSeats.push(seatNumber);
    }
    
    this.updatePassengerForms();
};

CityBusTracker.prototype.updatePassengerForms = function() {
    const container = document.getElementById('passengerDetails');
    if (!container) return;
    
    container.innerHTML = '';
    
    this.selectedSeats.forEach((seatNumber, index) => {
        const passengerForm = document.createElement('div');
        passengerForm.className = 'passenger-form';
        passengerForm.innerHTML = `
            <h5>Passenger ${index + 1} - Seat ${seatNumber}</h5>
            <div class="form-row">
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" id="passengerName${index}" placeholder="Enter full name" required>
                </div>
                <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="tel" id="passengerMobile${index}" placeholder="Enter mobile number" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Age</label>
                    <input type="number" id="passengerAge${index}" placeholder="Age" min="1" max="100" required>
                </div>
                <div class="form-group">
                    <label>Gender</label>
                    <select id="passengerGender${index}" required>
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(passengerForm);
    });
};

CityBusTracker.prototype.processBooking = function() {
    if (!this.selectedBus || this.selectedSeats.length === 0) {
        alert('Please select a bus and at least one seat');
        return;
    }
    
    // Collect passenger details
    const passengers = [];
    for (let i = 0; i < this.selectedSeats.length; i++) {
        const name = document.getElementById(`passengerName${i}`)?.value;
        const mobile = document.getElementById(`passengerMobile${i}`)?.value;
        const age = document.getElementById(`passengerAge${i}`)?.value;
        const gender = document.getElementById(`passengerGender${i}`)?.value;
        
        if (!name || !mobile || !age || !gender) {
            alert(`Please fill all details for Passenger ${i + 1}`);
            return;
        }
        
        passengers.push({
            name,
            mobile,
            age: parseInt(age),
            gender,
            seat: this.selectedSeats[i]
        });
    }
    
    // Calculate fare
    const baseFare = this.selectedBus.price * passengers.length;
    const seatUpgrade = 0; // No upgrade for now
    const taxes = Math.round(baseFare * 0.18); // 18% GST
    const totalFare = baseFare + seatUpgrade + taxes;
    
    // Create booking
    const booking = {
        id: 'BK' + Date.now(),
        busId: this.selectedBus.id,
        busNumber: this.selectedBus.number,
        route: this.selectedBus.route,
        fromStop: document.getElementById('fromStop').value,
        toStop: document.getElementById('toStop').value,
        date: document.getElementById('journeyDate').value,
        time: this.selectedBus.departure,
        passengers,
        fare: {
            baseTotal: baseFare,
            upgradeTotal: seatUpgrade,
            taxes: taxes,
            total: totalFare
        },
        paymentMethod: this.getSelectedPaymentMethod(),
        bookingTime: new Date().toISOString(),
        status: 'confirmed'
    };
    
    // Save booking
    const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');
    bookings.push(booking);
    localStorage.setItem('bookings', JSON.stringify(bookings));
    
    // Update seat availability
    this.selectedSeats.forEach(seatNumber => {
        const seatData = this.seatMap.get(seatNumber);
        seatData.available = false;
        seatData.selected = false;
    });
    
    // Store last booking for download functionality
    this.lastBooking = booking;
    
    // Show success modal
    this.showBookingSuccess(booking);
    
    // Close booking modal
    this.hideTicketModal();
    
    // Refresh tickets list
    this.loadTicketsList();
};

CityBusTracker.prototype.getSelectedPaymentMethod = function() {
    const activeTab = document.querySelector('.payment-tab.active');
    return activeTab ? activeTab.dataset.method : 'cash';
};

CityBusTracker.prototype.showBookingSuccess = function(booking) {
    const modal = document.getElementById('bookingSuccessModal');
    const detailsContainer = document.getElementById('bookingSuccessDetails');
    
    if (!modal || !detailsContainer) return;
    
    detailsContainer.innerHTML = `
        <h5>Booking Confirmation</h5>
        <div class="detail-row">
            <span>Booking ID:</span>
            <span>${booking.id}</span>
        </div>
        <div class="detail-row">
            <span>Bus:</span>
            <span>${booking.busNumber} - ${booking.route}</span>
        </div>
        <div class="detail-row">
            <span>Route:</span>
            <span>${booking.fromStop} → ${booking.toStop}</span>
        </div>
        <div class="detail-row">
            <span>Date & Time:</span>
            <span>${booking.date} at ${booking.time}</span>
        </div>
        <div class="detail-row">
            <span>Seats:</span>
            <span>${booking.passengers.map(p => p.seat).join(', ')}</span>
        </div>
        <div class="detail-row">
            <span>Passengers:</span>
            <span>${booking.passengers.length}</span>
        </div>
        <div class="detail-row">
            <span>Total Amount:</span>
            <span>₹${booking.fare.total}</span>
        </div>
    `;
    
    modal.classList.add('active');
};

CityBusTracker.prototype.hideBookingSuccess = function() {
    const modal = document.getElementById('bookingSuccessModal');
    if (!modal) return;
    modal.classList.remove('active');
};

CityBusTracker.prototype.switchPaymentMethod = function(method) {
    // Remove active class from all payment tabs
    document.querySelectorAll('.payment-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Add active class to selected tab
    const selectedTab = document.querySelector(`[data-method="${method}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Hide all payment content
    document.querySelectorAll('.payment-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Show selected payment content
    const selectedContent = document.getElementById(`${method}Payment`);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
};

CityBusTracker.prototype.selectWalletOption = function(wallet) {
    // Remove active class from all wallet options
    document.querySelectorAll('.wallet-option').forEach(option => {
        option.classList.remove('active');
    });
    
    // Add active class to selected option
    const selectedOption = document.querySelector(`[data-wallet="${wallet}"]`);
    if (selectedOption) {
        selectedOption.classList.add('active');
    }
};

CityBusTracker.prototype.downloadTicket = function() {
    // Simple ticket download functionality
    const booking = this.lastBooking;
    if (!booking) return;
    
    const ticketContent = `
PUNJAB BUS TRACKER - TICKET
============================
Booking ID: ${booking.id}
Bus: ${booking.busNumber} - ${booking.route}
Route: ${booking.fromStop} → ${booking.toStop}
Date: ${booking.date}
Time: ${booking.time}
Seats: ${booking.passengers.map(p => p.seat).join(', ')}
Passengers: ${booking.passengers.length}
Total Amount: ₹${booking.fare.total}
Payment Method: ${booking.paymentMethod}
Booking Time: ${new Date(booking.bookingTime).toLocaleString()}

Thank you for choosing Punjab Bus Tracker!
    `;
    
    const blob = new Blob([ticketContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${booking.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

CityBusTracker.prototype.viewTicket = function() {
    // Show ticket details in a modal
    if (this.lastBooking) {
        this.showTicketDetails(this.lastBooking);
    }
};

// ==================== BUS TRACKING SYSTEM ====================

CityBusTracker.prototype.setupBusTracking = function() {
    this.liveBuses = new Map();
    this.busMarkers = new Map();
    this.routePolylines = new Map();
    this.userMarker = null;
    this.isTracking = false;
    this.trackingInterval = null;
    
    // Initialize live buses for each route
    this.initializeLiveBuses();
};

CityBusTracker.prototype.initializeLiveBuses = function() {
    // Create live buses for each route with different positions
    this.routes.forEach((route, index) => {
        const busCount = 2 + Math.floor(Math.random() * 3); // 2-4 buses per route
        
        for (let i = 0; i < busCount; i++) {
            const busId = `${route.id}-bus-${i + 1}`;
            const busNumber = `${route.number}-${String(i + 1).padStart(2, '0')}`;
            
            // Random position along the route
            const randomStopIndex = Math.floor(Math.random() * (route.stops.length - 1));
            const currentStop = route.stops[randomStopIndex];
            const nextStop = route.stops[randomStopIndex + 1];
            
            // Interpolate position between stops
            const progress = Math.random();
            const lat = currentStop.lat + (nextStop.lat - currentStop.lat) * progress;
            const lng = currentStop.lng + (nextStop.lng - currentStop.lng) * progress;
            
            this.liveBuses.set(busId, {
                id: busId,
                number: busNumber,
                routeId: route.id,
                route: route,
                position: [lat, lng],
                currentStop: currentStop.name,
                nextStop: nextStop.name,
                speed: 30 + Math.random() * 40, // 30-70 km/h
                direction: Math.random() > 0.5 ? 'forward' : 'backward',
                status: Math.random() > 0.1 ? 'on-time' : 'delayed',
                passengers: Math.floor(Math.random() * 45) + 5, // 5-50 passengers
                lastUpdate: new Date(),
                color: route.color
            });
        }
    });
};

CityBusTracker.prototype.startBusTracking = function() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.updateGPSStatus('Tracking buses...', 'connected');
    
    // Draw routes on map
    this.drawRoutesOnMap();
    
    // Add bus markers
    this.addBusMarkers();
    
    // Start real-time updates
    this.trackingInterval = setInterval(() => {
        this.updateBusPositions();
        this.updateBusMarkers();
        this.updateVehicleCount();
        this.updateLastUpdateTime();
    }, 3000); // Update every 3 seconds
    
    // Update UI
    document.getElementById('trackBusBtn').textContent = 'Stop Tracking';
    document.getElementById('trackBusBtn').classList.remove('btn-success');
    document.getElementById('trackBusBtn').classList.add('btn-danger');
};

CityBusTracker.prototype.stopBusTracking = function() {
    if (!this.isTracking) return;
    
    this.isTracking = false;
    this.updateGPSStatus('Stopped', 'disconnected');
    
    // Clear tracking interval
    if (this.trackingInterval) {
        clearInterval(this.trackingInterval);
        this.trackingInterval = null;
    }
    
    // Remove bus markers
    this.busMarkers.forEach(marker => {
        if (this.map) {
            this.map.removeLayer(marker);
        }
    });
    this.busMarkers.clear();
    
    // Remove route polylines
    this.routePolylines.forEach(polyline => {
        if (this.map) {
            this.map.removeLayer(polyline);
        }
    });
    this.routePolylines.clear();
    
    // Update UI
    document.getElementById('trackBusBtn').textContent = 'Track Bus';
    document.getElementById('trackBusBtn').classList.remove('btn-danger');
    document.getElementById('trackBusBtn').classList.add('btn-success');
    document.getElementById('activeVehicles').textContent = '0';
};

CityBusTracker.prototype.drawRoutesOnMap = function() {
    if (!this.map) return;
    
    this.routes.forEach(route => {
        const coordinates = route.stops.map(stop => [stop.lat, stop.lng]);
        
        const polyline = L.polyline(coordinates, {
            color: route.color,
            weight: 4,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(this.map);
        
        // Add route labels
        const midPoint = coordinates[Math.floor(coordinates.length / 2)];
        const label = L.marker(midPoint, {
            icon: L.divIcon({
                className: 'route-label',
                html: `<div style="background: ${route.color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap;">${route.number}</div>`,
                iconSize: [60, 20],
                iconAnchor: [30, 10]
            })
        }).addTo(this.map);
        
        this.routePolylines.set(route.id, polyline);
    });
};

CityBusTracker.prototype.addBusMarkers = function() {
    if (!this.map) return;
    
    this.liveBuses.forEach(bus => {
        const busIcon = L.divIcon({
            className: 'bus-marker',
            html: `
                <div class="bus-marker-container" style="background: ${bus.color};">
                    <i class="fas fa-bus"></i>
                    <div class="bus-number">${bus.number}</div>
                    <div class="bus-status-indicator ${bus.status}"></div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
        
        const marker = L.marker(bus.position, { icon: busIcon })
            .addTo(this.map)
            .bindPopup(`
                <div class="bus-popup">
                    <h4>${bus.number}</h4>
                    <p><strong>Route:</strong> ${bus.route.name}</p>
                    <p><strong>Status:</strong> <span class="${bus.status}">${bus.status}</span></p>
                    <p><strong>Speed:</strong> ${Math.round(bus.speed)} km/h</p>
                    <p><strong>Passengers:</strong> ${bus.passengers}/50</p>
                    <p><strong>Current:</strong> ${bus.currentStop}</p>
                    <p><strong>Next:</strong> ${bus.nextStop}</p>
                </div>
            `);
        
        this.busMarkers.set(bus.id, marker);
    });
};

CityBusTracker.prototype.updateBusPositions = function() {
    this.liveBuses.forEach(bus => {
        // Simulate bus movement along route
        const route = bus.route;
        const stops = route.stops;
        
        // Find current position between stops
        let currentStopIndex = 0;
        for (let i = 0; i < stops.length - 1; i++) {
            if (bus.currentStop === stops[i].name) {
                currentStopIndex = i;
                break;
            }
        }
        
        // Move towards next stop
        const nextStopIndex = bus.direction === 'forward' 
            ? Math.min(currentStopIndex + 1, stops.length - 1)
            : Math.max(currentStopIndex - 1, 0);
        
        const currentStop = stops[currentStopIndex];
        const nextStop = stops[nextStopIndex];
        
        // Calculate movement
        const moveDistance = 0.001; // Small movement per update
        const latDiff = nextStop.lat - currentStop.lat;
        const lngDiff = nextStop.lng - currentStop.lng;
        const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        
        if (distance > 0) {
            const moveLat = (latDiff / distance) * moveDistance;
            const moveLng = (lngDiff / distance) * moveDistance;
            
            bus.position[0] += moveLat;
            bus.position[1] += moveLng;
            
            // Check if reached next stop
            const newDistance = Math.sqrt(
                Math.pow(nextStop.lat - bus.position[0], 2) + 
                Math.pow(nextStop.lng - bus.position[1], 2)
            );
            
            if (newDistance < 0.01) { // Reached stop
                bus.currentStop = nextStop.name;
                if (nextStopIndex === stops.length - 1) {
                    bus.direction = 'backward';
                } else if (nextStopIndex === 0) {
                    bus.direction = 'forward';
                }
                bus.nextStop = bus.direction === 'forward' 
                    ? stops[Math.min(nextStopIndex + 1, stops.length - 1)].name
                    : stops[Math.max(nextStopIndex - 1, 0)].name;
            }
        }
        
        bus.lastUpdate = new Date();
    });
};

CityBusTracker.prototype.updateBusMarkers = function() {
    this.liveBuses.forEach(bus => {
        const marker = this.busMarkers.get(bus.id);
        if (marker) {
            marker.setLatLng(bus.position);
            
            // Update popup content
            marker.setPopupContent(`
                <div class="bus-popup">
                    <h4>${bus.number}</h4>
                    <p><strong>Route:</strong> ${bus.route.name}</p>
                    <p><strong>Status:</strong> <span class="${bus.status}">${bus.status}</span></p>
                    <p><strong>Speed:</strong> ${Math.round(bus.speed)} km/h</p>
                    <p><strong>Passengers:</strong> ${bus.passengers}/50</p>
                    <p><strong>Current:</strong> ${bus.currentStop}</p>
                    <p><strong>Next:</strong> ${bus.nextStop}</p>
                    <p><strong>Last Update:</strong> ${bus.lastUpdate.toLocaleTimeString()}</p>
                </div>
            `);
        }
    });
};

CityBusTracker.prototype.updateVehicleCount = function() {
    const count = this.liveBuses.size;
    document.getElementById('activeVehicles').textContent = count;
};

CityBusTracker.prototype.updateLastUpdateTime = function() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
};

CityBusTracker.prototype.updateGPSStatus = function(text, status) {
    const statusElement = document.getElementById('gpsStatusText');
    const statusContainer = document.getElementById('gpsStatus');
    
    if (statusElement) {
        statusElement.textContent = text;
    }
    
    if (statusContainer) {
        statusContainer.className = `gps-status ${status}`;
    }
};

CityBusTracker.prototype.centerMapOnUser = function() {
    if (this.userLocation && this.map) {
        this.map.setView(this.userLocation, 12);
    } else {
        this.getUserLocation();
    }
};

CityBusTracker.prototype.addUserLocationMarker = function() {
    if (this.userLocation && this.map) {
        if (this.userMarker) {
            this.map.removeLayer(this.userMarker);
        }
        
        const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `
                <div class="user-marker-container">
                    <i class="fas fa-user-circle"></i>
                    <div class="location-pulse"></div>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        this.userMarker = L.marker(this.userLocation, { icon: userIcon })
            .addTo(this.map)
            .bindPopup(`
                <div class="user-popup">
                    <h4><i class="fas fa-user-circle"></i> Your Location</h4>
                    <p><strong>Latitude:</strong> ${this.userLocation[0].toFixed(6)}</p>
                    <p><strong>Longitude:</strong> ${this.userLocation[1].toFixed(6)}</p>
                    <p><strong>Status:</strong> <span class="live">Live GPS</span></p>
                </div>
            `);
    }
};
