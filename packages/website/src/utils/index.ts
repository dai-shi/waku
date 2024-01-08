export const scrollTo = (id: string) => {
  const element = document.getElementById(id);

  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
