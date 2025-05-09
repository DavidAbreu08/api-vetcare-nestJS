//TODO: Implement the NIF Validator, this on isnt workink...

import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";

@ValidatorConstraint({ name: "NifValidator", async: false })
export class NifValidator implements ValidatorConstraintInterface {
  validate(nif: number, args: ValidationArguments): boolean {
    if (!nif || typeof nif !== "number") return false; // Ensure it's a valid number

    const nifStr = nif.toString(); // Convert number to string safely
    if (!/^\d{9}$/.test(nifStr)) return false; // Ensure it has exactly 9 digits

    const validPrefixes = ["1", "2", "3", "5", "6", "8", "9"]; // Valid first digits
    if (!validPrefixes.includes(nifStr.charAt(0))) return false;

    // Checksum validation (mod 11 algorithm)
    let total = 0;
    for (let i = 0; i < 8; i++) {
      total += parseInt(nifStr[i]) * (9 - i);
    }
    let checkDigit = 11 - (total % 11);
    if (checkDigit >= 10) checkDigit = 0; // If result is 10 or 11, it should be 0

    return checkDigit === parseInt(nifStr[8]); // Validate check digit
  }

  defaultMessage(args: ValidationArguments): string {
    return "Invalid NIF number";
  }
}
