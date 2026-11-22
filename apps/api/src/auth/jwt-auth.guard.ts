import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: { id: string; email: string; name: string };
    }>();
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Sign in required');
    }

    try {
      const payload = this.jwt.verify<{
        sub: string;
        email: string;
        name: string;
      }>(token, {
        secret: this.config.get<string>('JWT_SECRET') || 'sakiya-dev-secret',
      });
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired');
    }
  }
}
