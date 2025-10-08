function applyDateFilter(query, startDate, endDate) {
  if (startDate && endDate) {
    startDate = startDate.setHours(0, 0, 0, 0);
    endDate = endDate.setHours(23, 59, 59, 999);
    query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (startDate) {
    startDate = startDate.setHours(0, 0, 0, 0);
    query.createdAt = { $gte: new Date(startDate) };
  } else if (endDate) {
    endDate = endDate.setHours(23, 59, 59, 999);
    query.createdAt = { $lte: new Date(endDate) };
  }
  return query;
}
// This function modifies the query object to filter records based on the provided start and end dates.
// It sets the time for startDate to the beginning of the day and for endDate to the end of the day.
// This ensures that all records created on those dates are included in the filter.
// Usage example:
// let query = {};
// query = applyDateFilter(query, new Date('2023-01-01'), new Date('2023-01-31'));
// The resulting query will filter records created between January 1, 2023, and January 31, 2023, inclusive.
// The function can be imported and used in any route or controller where date filtering is required.
// Example import statement:
// import { applyDateFilter } from '../utils/dateFilter.js';

module.exports = { applyDateFilter };
