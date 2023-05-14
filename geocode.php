<?php
// Receive the data from the client
$input = file_get_contents('php://input');
$data = json_decode($input, true)['data'];

$accessToken = 'pk.eyJ1Ijoib2dib25kYWdsb3J5IiwiYSI6ImNsaGZlajZqZzA3eGQzbnBmc3Z1dXNhNHoifQ.5jg6108wmHZYjgvBoN-NoA';
$geocodedData = [];

// Geocode the data
foreach ($data as $d) {
  $citizenship_stable = $d['citizenship_stable'];

  $url = "https://api.mapbox.com/geocoding/v5/mapbox.places/$citizenship_stable.json?access_token=$accessToken";
  $json = file_get_contents($url);
  $geocodingData = json_decode($json, true);

  $d['stable_longitude'] = $geocodingData['features'][0]['center'][0];
  $d['stable_latitude'] = $geocodingData['features'][0]['center'][1];

  $geocodedData[] = $d;
}

// Save the geocoded data to a CSV file
$fp = fopen('geocodedData.csv', 'w');

foreach ($geocodedData as $fields) {
    fputcsv($fp, $fields);
}

fclose($fp);

// Send the geocoded data back to the client
echo json_encode($geocodedData);
?>
