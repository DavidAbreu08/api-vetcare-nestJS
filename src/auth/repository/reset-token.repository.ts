import { Repository, DataSource } from 'typeorm';
import { ResetTokenEntity } from '../entities/reset-token.entity';

export class ResetTokenEntityRepository extends Repository<ResetTokenEntity> {
  constructor(private readonly dataSource: DataSource) {
    super(ResetTokenEntity, dataSource.createEntityManager());
  }

  // Custom methods go here, for example:
  // async findByToken(token: string) {
  //   return await this.findOne({ where: { resetToken: token } });
  // }
}
