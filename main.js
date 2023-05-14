// Set your Mapbox API access token
mapboxgl.accessToken = 'pk.eyJ1Ijoib2dib25kYWdsb3J5IiwiYSI6ImNsaGZlajZqZzA3eGQzbnBmc3Z1dXNhNHoifQ.5jg6108wmHZYjgvBoN-NoA';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v10',
  center: [0, 0],
  zoom: 1,
  pitch: 0,
  bearing: 0,
  renderWorldCopies: false,
  antialias: true,
  hash: true
});

let selectedCitizenship = null;

map.on('load', function () {
  d3.csv('geocoded_population_no_missing.csv').then(data => {
    // Convert the data to GeoJSON format
    let geojson = convertToGeoJSON(data);

    // Update the map
    updateMap(geojson);

    // Remove the loading spinner
    let loader = document.getElementById('loader');
    loader.style.display = 'none';

    // Add an event listener for the 'idle' event and create the slider
    map.once('idle', function() {
      createSlider(data);
    });

    // Create a new popup
    let popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    // Display a popup on mousemove for the origin layer
    map.on('mousemove', 'originLayer', function(e) {
      map.getCanvas().style.cursor = 'pointer';
      let coordinates = e.features[0].geometry.coordinates.slice();
      let description = `<strong>${e.features[0].properties.citizenship_stable}</strong><br>Internally Displaced: ${e.features[0].properties.value}`;

      // Ensure that if the map is zoomed out such that multiple copies of the feature are visible, the popup appears over the copy being pointed to.
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // Populate the popup and set its coordinates based on the feature.
      popup.setLngLat(coordinates).setHTML(description).addTo(map);
    });

    // Display a popup on mousemove for the destination layer
    map.on('mousemove', 'destinationLayer', function(e) {
      map.getCanvas().style.cursor = 'pointer';
      let coordinates = e.features[0].geometry.coordinates.slice();
      let description = `<strong>${e.features[0].properties.citizenship_stable}</strong><br>Refugees: ${e.features[0].properties.value}`;

      // Ensure that if the map is zoomed out such that multiple copies of the feature are visible, the popup appears over the copy being pointed to.
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // Populate the popup and set its coordinates based on the feature.
      popup.setLngLat(coordinates).setHTML(description).addTo(map);
    });

    map.on('mouseleave', 'destinationLayer', function() {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    map.on('mouseleave', 'originLayer', function() {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

   // Add the clustering feature
map.addSource('refugees', {
  type: 'geojson',
  data: geojson,
  cluster: true,
  clusterMaxZoom: 14, // Max zoom to cluster points
  clusterRadius: 50 // Radius of each cluster when clustering points
});

map.addLayer({
  id: 'clusters',
  type: 'circle',
  source: 'refugees',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      '#00ff00', // color when hover is true
      [
        'step',
        ['get', 'point_count'],
        '#FFCC66',
        100,
        '#FF9900',
        750,
        '#FF0000'
      ] // color scale when hover is false
    ],
    'circle-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.5, // opacity when hover is true
      1 // opacity when hover is false
    ],
    'circle-radius': [
      'step',
      ['get', 'point_count'],
      20,
      100,
      30,
      750,
      40
    ]
  }
});

let hoveredFeatureId = null;

// When the mouse enters a cluster, set its hover state to true
map.on('mouseenter', 'clusters', function(e) {
  map.getCanvas().style.cursor = 'pointer';
  hoveredFeatureId = e.features[0].id;
  map.setFeatureState(
    { source: 'refugees', id: hoveredFeatureId },
    { hover: true }
  );
});

// When the mouse leaves a cluster, set its hover state to false
map.on('mouseleave', 'clusters', function() {
  map.getCanvas().style.cursor = '';
  if (hoveredFeatureId !== null) {
    map.setFeatureState(
      { source: 'refugees', id: hoveredFeatureId },
      { hover: false }
    );
  }
  hoveredFeatureId = null;
});

// When a click event occurs on a cluster, expand it and show details in the sidebar
map.on('click', 'clusters', function(e) {
  let features = map.queryRenderedFeatures(e.point, {
    layers: ['clusters']
  });
  let clusterId = features[0].properties.cluster_id;

  // Expand the cluster
  map.getSource('refugees').getClusterExpansionZoom(
    clusterId,
    function(err, zoom) {
      if (err) {
        return console.error('Error during cluster expansion:', err);
      }

      map.flyTo({
        center: features[0].geometry.coordinates,
        zoom: zoom
      });
    }
  );

  // Get the points in the cluster and show details in the sidebar
  map.getSource('refugees').getClusterLeaves(
    clusterId,
    100,  // limit (max number of features to return)
    0,    // offset (number of features to skip)
    function(err, leaves) {
      if (err) {
        return console.error('Error during getting cluster leaves:', err);
      }

      // Populate the sidebar with information about the points in the cluster
      let sidebar = document.getElementById('sidebar');
      sidebar.innerHTML = '<h2>Migration Data</h2>';
      leaves.forEach(function(leaf) {
        let sidebarContent = `<strong>${leaf.properties.citizenship_stable}</strong><br>`;
            
        if (leaf.properties.featureType === "origin") {
          sidebarContent += `Internally Displaced: ${leaf.properties.value}<br>`;
      
          // Fetch the location for the coordinates of the origin point
          fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${leaf.geometry.coordinates[0]},${leaf.geometry.coordinates[1]}.json?access_token=pk.eyJ1Ijoib2dib25kYWdsb3J5IiwiYSI6ImNsaGZlajZqZzA3eGQzbnBmc3Z1dXNhNHoifQ.5jg6108wmHZYjgvBoN-NoA`)
          .then(response => response.json())
          .then(data => {
            if (data.features && data.features.length > 0) {
              sidebarContent += `Location: ${data.features[0].place_name}<br>`;
            }
      
            sidebar.innerHTML += `<p>${sidebarContent}</p>`;
          });
        } else if (leaf.properties.featureType === "destination") {
          sidebarContent += `Refugees: ${leaf.properties.value}<br>`;

          // Fetch the location for the coordinates of the destination point
          fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${leaf.geometry.coordinates[0]},${leaf.geometry.coordinates[1]}.json?access_token=pk.eyJ1Ijoib2dib25kYWdsb3J5IiwiYSI6ImNsaGZlajZqZzA3eGQzbnBmc3Z1dXNhNHoifQ.5jg6108wmHZYjgvBoN-NoA`)
          .then(response => response.json())
          .then(data => {
            if (data.features && data.features.length > 0) {
              sidebarContent += `Location: ${data.features[0].place_name}<br>`;
            }
      
            sidebar.innerHTML += `<p>${sidebarContent}</p>`;
          });
        }
      });
    }
);

// Get the sidebar and the button
let sidebar = document.getElementById('sidebar');
let toggleButton = document.getElementById('toggleSidebar');

// Open the sidebar and update the button text
sidebar.style.right = '0px';
toggleButton.innerHTML = 'Hide Data';
 // Make the sidebar appear
 document.getElementById('sidebar').style.right = '0px';

});


    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'refugees',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      }
    });

    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'refugees',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#11b4da',
        'circle-radius': 4,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff'
      }
    });
    

    // Create the legend
  let legend = document.getElementById('legend');
  
  // Add an entry for individual points
  let individualEntry = document.createElement('div');
  individualEntry.innerHTML = `
    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #11b4da;"></span>
    <label> - Individual point</label>
  `;
  legend.appendChild(individualEntry);

  // Add entries for the clusters
  let clusterColors = ['#FFCC66', '#FF9900', '#FF0000'];
  let clusterSizes = [20, 30, 40];
  let clusterCounts = [1, 100, 750];

  for (let i = 0; i < clusterColors.length; i++) {
    let clusterEntry = document.createElement('div');
    clusterEntry.innerHTML = `
      <span style="display: inline-block; width: ${clusterSizes[i]}px; height: ${clusterSizes[i]}px; border-radius: 50%; background-color: ${clusterColors[i]};"></span>
      <label> - Cluster (>=${clusterCounts[i]} points)</label>
    `;
    legend.appendChild(clusterEntry);
  }

  });
});


// Move the slider creation code to a separate function
function createSlider(data) {
  let years = Array.from(new Set(data.map(d => d.year)));

  // Create a container for the slider and label
  let sliderContainer = d3.select('body').append('div')
    .style('position', 'absolute') // Set position to absolute to make the slider appear on top of the map
    .style('top', '10px') // Set top margin
    .style('left', '10px'); // Set left margin

  // Create the slider
let slider = sliderContainer.append('input')
  .attr('type', 'range')
  .attr('min', d3.min(years))
  .attr('max', d3.max(years))
  .attr('value', d3.min(years))
  .style('width', '300px'); // Set the width of the slider

// Create the label
let sliderLabel = sliderContainer.append('p')
  .style('font-weight', 'bold')
  .style('color', 'black')
  .text(`Year: ${d3.min(years)} - ${d3.max(years)}`); // Set initial label to full range

// Create a container for the total points count
let totalContainer = d3.select('body').append('div')
  .style('position', 'absolute')
  .style('bottom', '10px')
  .style('left', '50%') // Center the container horizontally
  .style('transform', 'translateX(-50%)'); // Center the container horizontally

// Create the total points count text
// Create the total points count text
let totalPointsText = d3.select('body').append('p')
  .style('font-size', '20px')
  .style('position', 'absolute')
  .style('text-align', 'center')
  .style('width', '100%')
  .style('bottom', '10px')
  .text(`Total Points: ${data.length.toLocaleString()}`);

// Variable to track whether it's the first time the 'input' event is triggered
let isFirstInput = true;
// Add an event listener to update the map when the slider value changes
slider.on('input', function() {
  let year = this.value;

  // Calculate the total number of points for the given year
  let totalPoints;
  
  // Check if it's the first input
  if (isFirstInput) {
    // If it is, display the total number of points in the data
    totalPoints = data.length;
    // Update the variable to indicate that the first input has been handled
    isFirstInput = false;
  } else {
    // If not, display the number of points in the selected year
    totalPoints = data.filter(d => d.year == year).length;
  }

  // Update the total points count text
  totalPointsText.text(`Total Points: ${totalPoints.toLocaleString()}`);

  // Update the label
  sliderLabel.text(`Year: ${year}`); // Always show specific year
      if (map.getSource('refugees')) {
        let filteredData = data.filter(d => d.year == year);
        let filteredGeojson = convertToGeoJSON(filteredData);
        map.getSource('refugees').setData(filteredGeojson);
      }
      
      // Check if the layer exists before filtering
      if (map.getLayer('originLayer')) {
        map.setFilter('originLayer', ['==', ['get', 'year'], year]);
      }

      if (map.getLayer('destinationLayer')) {
        map.setFilter('destinationLayer', ['==', ['get', 'year'], year]);
      }
        
      if (map.getLayer('unclustered-point')) {
        map.setFilter('unclustered-point', ['==', ['get', 'year'], year]);
      }
    });

}

// Function to convert the data to GeoJSON
function convertToGeoJSON(data) {
  let aggregatedData = {};

  data.forEach(d => {
    // Aggregate origin features
    let originKey = `${d.year}-origin-${d.citizenship_stable}`;
    if (!aggregatedData[originKey]) {
      aggregatedData[originKey] = {
        type: 'Feature',
        properties: {
          year: d.year,
          value: parseFloat(d.refugees) || 0,
          citizenship_stable: d.citizenship_stable,
          featureType: 'origin'
        },
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(d.stable_longitude), parseFloat(d.stable_latitude)],
        }
      };
    } else {
      aggregatedData[originKey].properties.value += parseFloat(d.refugees) || 0;
    }

    // Aggregate destination features
    let destinationKey = `${d.year}-destination-${d.city}`;
    if (!aggregatedData[destinationKey]) {
      aggregatedData[destinationKey] = {
        type: 'Feature',
        properties: {
          year: d.year,
          value: parseFloat(d.refugees) || 0,
          citizenship_stable: d.citizenship_stable,
          featureType: 'destination'
        },
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(d.longitude), parseFloat(d.latitude)],
        }
      };
    } else {
      aggregatedData[destinationKey].properties.value += parseFloat(d.refugees) || 0;
    }

  });

  return {
    type: 'FeatureCollection',
    features: Object.values(aggregatedData)
  };
}


// Function to update the map
function updateMap(data) {
   // Separate origin and destination data
   let originData = {
    type: 'FeatureCollection',
    features: data.features.filter(feature => feature.properties.featureType === 'origin')
  };
  let destinationData = {
    type: 'FeatureCollection',
    features: data.features.filter(feature => feature.properties.featureType === 'destination')
  };
  // Separate data for clustering
  // let clusterData = {
  //   type: 'FeatureCollection',
  //   features: data.features
  // };


  // Modify the circle color and opacity based on whether the data point's citizenship matches the selected one
  let circlePaint = citizenship => ({
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['get', 'value'],
      1, 5, // Circle radius of 5 for values between 1-70
      70, 10, // Circle radius of 10 for values between 71-140
      140, 15 // Circle radius of 15 for values between 141-200
    ],
    'circle-color': citizenship === selectedCitizenship ? '#00FF00' : '#FFCC66',
    'circle-opacity': citizenship === selectedCitizenship ? 1 : 0.8
  });

  // Set the paint properties for each data point
  originData.features.forEach(feature => {
    feature.properties.circlePaint = circlePaint(feature.properties.citizenship_stable);
  });
  destinationData.features.forEach(feature => {
    feature.properties.circlePaint = circlePaint(feature.properties.citizenship_stable);
  });

  // Add the origin data to the map as a source
  if (map.getSource('originData')) {
    map.getSource('originData').setData(originData);
  } else {
    try {
      map.addSource('originData', { type: 'geojson', data: originData });
    } catch (error) {
      console.log("Error adding origin data source: ", error);
    }
  }

  // Use the 'originData' source to create a new layer for origin
  // if (!map.getLayer('originLayer')) {
  //   try {
  //     map.addLayer({
  //       id: 'originLayer',
  //       type: 'circle',
  //       source: 'originData',
  //       paint: {
  //         'circle-radius': [
  //           'interpolate',
  //           ['linear'],
  //           ['get', 'value'],
  //           1, 5, // Circle radius of 5 for values between 1-70
  //           70, 10, // Circle radius of 10 for values between 71-140
  //           140, 15 // Circle radius of 15 for values between 141-200
  //         ],
  //         'circle-color': '#FFCC66', // set color for origin
  //         'circle-opacity': 0.8
  //       }
  //     });
  //   } catch (error) {
  //     console.log("Error adding origin layer: ", error);
  //   }
  // }

  // Add the destination data to the map as a source
  if (map.getSource('destinationData')) {
    map.getSource('destinationData').setData(destinationData);
  } else {
    try {
      map.addSource('destinationData', { type: 'geojson', data: destinationData });
    } catch (error) {
      console.log("Error adding destination data source: ", error);
    }
  }

  // Use the 'destinationData' source to create a new layer for destination
  // if (!map.getLayer('destinationLayer')) {
  //   try {
  //     map.addLayer({
  //       id: 'destinationLayer',
  //       type: 'circle',
  //       source: 'destinationData',
  //       paint: {
  //         'circle-radius': [
  //           'interpolate',
  //           ['linear'],
  //           ['get', 'value'],
  //           1, 5, // Circle radius of 5 for values between 1-70
  //           70, 10, // Circle radius of 10 for values between 71-140
  //           140, 15 // Circle radius of 15 for values between 141-200
  //         ],
  //         'circle-color': [
  //           'interpolate',
  //           ['linear'],
  //           ['get', 'value'],
  //           1, '#FF9900',
  //           200, '#FF0000'
  //         ],
  //         'circle-opacity': 0.8       
  //       }
  //     });
  //   } catch (error) {
  //     console.log("Error adding destination layer: ", error);
  //   }
  // }



  
// Set the paint property of the layer to the circlePaint property of the data point
    // map.addLayer({
    //   id: 'destinationLayer',
    //   type: 'circle',
    //   source: 'destinationData',
    //   paint: ['get', 'circlePaint']
    // });

    

}

document.getElementById('toggleSidebar').addEventListener('click', function() {
  let sidebar = document.getElementById('sidebar');
  let toggleButton = this;  // 'this' refers to the element the event was bound to
  let isHidden = sidebar.style.right === '0px';

  sidebar.style.right = isHidden ? '-25%' : '0px';

  // Change the button text based on whether the sidebar is now hidden or not
  toggleButton.innerHTML = isHidden ? 'View Data' : 'Hide Data';
});



