const password =
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$ %^&*-]).{8,}$/;
const phoneRegex = /^[0-9]{9}$/;

export const RegExHelper = {
  password,
  phoneRegex,
};
