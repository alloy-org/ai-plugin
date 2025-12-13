
// --------------------------------------------------------------------------
export async function userSearchCriteria(app) {
  const userQuery = await app.prompt("Enter your search criteria");
  return { userQuery };
}
