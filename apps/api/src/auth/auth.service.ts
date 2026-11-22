import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { Model } from 'mongoose';
import { GoogleAuthDto } from './dto/google.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from './schemas/user.schema';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectModel(User.name) private users: Model<User>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID') || '',
    );
  }

  private toUser(doc: {
    _id: { toString(): string };
    email: string;
    name: string;
    avatarUrl?: string | null;
  }): AuthUser {
    return {
      id: doc._id.toString(),
      email: doc.email,
      name: doc.name,
      avatarUrl: doc.avatarUrl ?? null,
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
      googleId: null,
      avatarUrl: null,
    });

    return this.sign(this.toUser(created));
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ email });
    if (!user?.passwordHash) {
      throw new UnauthorizedException(
        user?.googleId
          ? 'This account uses Google Sign-In'
          : 'Invalid email or password',
      );
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.sign(this.toUser(user));
  }

  async google(dto: GoogleAuthDto) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google Sign-In is not configured');
    }

    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
    };
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: clientId,
      });
      payload = ticket.getPayload() || {};
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const googleId = payload.sub;
    const email = payload.email?.trim().toLowerCase();
    const verified =
      payload.email_verified === true || payload.email_verified === 'true';
    if (!googleId || !email || !verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    let user = await this.users.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!user) {
      user = await this.users.create({
        email,
        name: (payload.name || email.split('@')[0]).trim(),
        googleId,
        passwordHash: null,
        avatarUrl: payload.picture || null,
      });
    } else {
      user.googleId = user.googleId || googleId;
      if (payload.picture) user.avatarUrl = payload.picture;
      if (!user.name && payload.name) user.name = payload.name;
      await user.save();
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
