/**
 * Obfuscate exact coordinates by adding a randomized offset.
 * Used to protect property owner privacy.
 * 0.001 degrees of lat/lng represents roughly 111 meters.
 * We add an offset between 150m to 350m (+/- 0.0015 to 0.0035 degrees).
 */
function obfuscateCoordinates(latitude, longitude) {
  const exactLat = parseFloat(latitude);
  const exactLng = parseFloat(longitude);

  // Generate randomized offset between 0.0015 and 0.0035
  const latOffsetMagnitude = 0.0015 + Math.random() * 0.002;
  const lngOffsetMagnitude = 0.0015 + Math.random() * 0.002;

  // Decide random direction (+ or -)
  const latDirection = Math.random() < 0.5 ? -1 : 1;
  const lngDirection = Math.random() < 0.5 ? -1 : 1;

  const approxLat = exactLat + latOffsetMagnitude * latDirection;
  const approxLng = exactLng + lngOffsetMagnitude * lngDirection;

  return {
    approxLatitude: parseFloat(approxLat.toFixed(8)),
    approxLongitude: parseFloat(approxLng.toFixed(8)),
  };
}

module.exports = {
  obfuscateCoordinates,
};
