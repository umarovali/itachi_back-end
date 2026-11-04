import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AdminRole } from '../common/enums';

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Нормализованный телефон: +998901234567 */
  @Column({ unique: true, length: 20 })
  phone: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.ADMIN })
  role: AdminRole;

  @Column({ default: true })
  isActive: boolean;

  /** sha256 от текущего refresh-токена (одна активная сессия на админа) */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  refreshTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
