export function getStartYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month <= 5) {
    return `${year - 1}01`;
  } else {
    return `${year}01`;
  }
}

export function getEndYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month <= 5) {
    return `${year - 1}12`;
  } else {
    return `${year}06`;
  }
}

export function getVatYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return month <= 5 ? year - 1 : year;
}

export function getVatHalf() {
  const now = new Date();
  const month = now.getMonth();

  return month <= 5 ? '2' : '1';
}
