import { UnauthorizedException } from "@nestjs/common";
import { hashSync } from "bcrypt";
import { PersistenceService } from "src/app/core/persistence/persistence.service";
import { UsersBusinessService } from "src/app/users/users.business.service";
import { UsersService } from "src/app/users/users.service";
import { AuthService } from "./auth.service";

describe("AuthService rejects inactive or deleted accounts", () => {
  let usersRepository: { findOne: jest.Mock }, auth: AuthService;

  beforeEach(() => {
    usersRepository = { findOne: jest.fn() };
    const business = new UsersBusinessService(new PersistenceService(), {} as any, usersRepository as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    auth = new AuthService(new UsersService(business), {} as any, {} as any, {} as any, {} as any, new PersistenceService());
  });

  it("rejects a token of an account deactivated after issue, on every request", async () => {
    usersRepository.findOne.mockResolvedValue({ id: "U-1", isActive: false });
    await expect(auth.validateJwtUser("U-1")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token of a soft-deleted account (excluded by the repository)", async () => {
    usersRepository.findOne.mockResolvedValue(null);
    await expect(auth.validateJwtUser("U-1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { id: "U-1" } });
  });

  it("refuses local login for inactive accounts even with the right password", async () => {
    usersRepository.findOne.mockResolvedValue({ id: "U-1", isActive: false, passwordHash: hashSync("Secret#123", 4) });
    await expect(auth.validateUser(" User@Example.com ", "Secret#123")).resolves.toBeNull();
    expect(usersRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "user@example.com" } }));
    usersRepository.findOne.mockResolvedValue(null);
    await expect(auth.validateUser("user@example.com", "Secret#123")).resolves.toBeNull();
  });
});
