import { Actor } from "../core/authorization";
import { ReservationEntity } from "./entities/reservation.entity";
import { serializeReservation, serializeReservations } from "./reservation.serializer";

const account = (id: string, name: string) => ({
  id, name, email: `${id}@x.pt`, phone: "912345678", birthDate: "1990-01-01", nif: "123456789",
  profilePictureUrl: `https://img/${id}.png`, isActive: true, description: "d", notes: "private notes",
  passwordHash: "$2b$10$hash", createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null,
});
const actor = (flags: Partial<Actor>): Actor => ({ id: "x", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
const reservation = () => ({
  id: "R-1", status: "confirmed", notificationStatus: "sent",
  client: account("client", "Cliente"), employee: account("vet", "Vet"),
  animal: { id: "A-1", name: "Rex", owner: account("client", "Cliente") },
}) as unknown as ReservationEntity;

describe("Reservation projection", () => {
  it("shows a client only the employee's id, name and picture, and no repeated owner", () => {
    const view: any = serializeReservation(reservation(), actor({ id: "client", isClient: true }));
    expect(view.employee).toEqual({ id: "vet", name: "Vet", profilePictureUrl: "https://img/vet.png" });
    expect(view.client).toEqual({ id: "client", name: "Cliente", email: "client@x.pt", phone: "912345678" });
    expect(view.animal).toEqual({ id: "A-1", name: "Rex" });
    expect(view).toMatchObject({ id: "R-1", status: "confirmed", notificationStatus: "sent" });
  });

  it("shows staff (non-admin) only the client's contact data and the reduced employee", () => {
    const [view]: any[] = serializeReservations([reservation()], actor({ id: "vet", isEmployee: true }));
    expect(view.client).toEqual({ id: "client", name: "Cliente", email: "client@x.pt", phone: "912345678" });
    expect(view.employee).toEqual({ id: "vet", name: "Vet", profilePictureUrl: "https://img/vet.png" });
    expect(JSON.stringify(view)).not.toMatch(/nif|birthDate|private notes|passwordHash/);
  });

  it("shows administrators full accounts without password hashes", () => {
    const view: any = serializeReservation(reservation(), actor({ isAdmin: true }));
    for (const user of [view.client, view.employee, view.animal.owner]) {
      expect(user).toMatchObject({ nif: "123456789", birthDate: "1990-01-01", notes: "private notes" });
      expect(user).not.toHaveProperty("passwordHash");
    }
  });

  it("keeps absent relations absent", () => {
    const { client: _client, ...withoutClient } = reservation() as any;
    const view: any = serializeReservation({ ...withoutClient, employee: null } as ReservationEntity, actor({ isClient: true }));
    expect(view).not.toHaveProperty("client");
    expect(view.employee).toBeNull();
  });
});
