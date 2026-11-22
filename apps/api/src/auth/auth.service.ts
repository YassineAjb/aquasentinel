import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from './schemas/user.schema';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private toUser(doc: User & { _id: { toString(): string } }): AuthUser {
    return {
      id: doc._id.toString(),
      email: doc.email,
      name: doc.name,
    };
  }

  private sign(user: AuthUser) {
    const token = this.jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      {
        secret: this.config.get<string>('JWT_SECRET') || 'sakiya-dev-secret',
        expiresIn: '7d',
      },
    );
    return { token, user };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.users.findOne({ email }).lean();
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.users.create({
      email,
      name: dto.name.trim(),
      passwordHash,
    });

    return this.sign(this.toUser(created));
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.sign(this.toUser(user));
  }

  async me(userId: string) {
    const user = await this.users.findById(userId).lean();
    if (!user) {
      throw new UnauthorizedException('Session expired');
    }
    return this.toUser(user as User & { _id: { toString(): string } });
  }
}
