// @ts-ignore
import db from "./db.js";

export const UsersList = async ({ searchText }: { searchText: string }) => {
  // WARNING: This is for demo purposes only.
  // We don't encourage this in real apps. There are far safer ways to access
  // data in a real application!
  const users = (await db.query(
    `select * from users where username ilike $1 order by id desc`,
    ['%' + searchText + '%']
  )).rows;

  return (
    <div style={{ border: "3px blue red", margin: "1em", padding: "1em" }}>
      <h3>A Server component.</h3>
      <ul >
        {users.map((user: any) => <li>{user.username}</li>)}
      </ul>
    </div>
  );
};
