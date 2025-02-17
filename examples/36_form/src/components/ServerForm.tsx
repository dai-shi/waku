async function submitUserProfile(formData: FormData) {
  'use server';
  const name = formData.get('name');
  const age = formData.get('age');
  const favoriteColor = formData.get('favoriteColor');
  const hobby = formData.get('hobby');
  const isSubscribed = formData.get('newsletter') === 'on';

  console.log({
    name,
    age,
    favoriteColor,
    hobby,
    isSubscribed,
  });
}

export const ServerForm = () => {
  return (
    <form action={submitUserProfile} className="space-y-4">
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <label htmlFor="name">Full Name</label>
        <input type="text" name="name" id="name" required />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <label htmlFor="age">Age</label>
        <input type="number" name="age" id="age" min="13" max="120" />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <label htmlFor="favoriteColor">Favorite Color</label>
        <select name="favoriteColor" id="favoriteColor">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
          <option value="purple">Purple</option>
          <option value="yellow">Yellow</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <label htmlFor="hobby">Favorite Hobby</label>
        <input
          type="text"
          name="hobby"
          id="hobby"
          placeholder="e.g. Reading, Gaming, Cooking"
        />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <label>
          <input type="checkbox" name="newsletter" />
          Subscribe to newsletter
        </label>
      </div>

      <button type="submit">Save Profile</button>
    </form>
  );
};
