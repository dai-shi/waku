import slugify from '@sindresorhus/slugify';

export const getAnchor = (value: string) => {
  const isString = typeof value === 'string';

  return isString ? slugify(value) : '';
};

export const scrollTo = (id: string) => {
  const element = document.getElementById(id);

  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
