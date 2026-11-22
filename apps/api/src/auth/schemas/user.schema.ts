import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: false, default: null })
  passwordHash!: string | null;

  @Prop({ type: String, required: false, unique: true, sparse: true, default: null })
  googleId!: string | null;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: false, default: null })
  avatarUrl!: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
