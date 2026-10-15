import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import type { Request } from "express";
import { MIN_PASSWORD_LENGTH } from "./auth.constants";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { AuthenticatedUser } from "./jwt-auth.guard";
import { Public } from "./public.decorator";

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(256)
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(256)
  newPassword!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @Post("login")
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.auth.login(body.email, body.password, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]?.toString(),
    });
  }

  @Public()
  @Post("refresh")
  refresh(@Body() body: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]?.toString(),
    });
  }

  @Public()
  @Post("logout")
  logout(@Body() body: RefreshDto, @Req() req: Request) {
    if (!body.refreshToken) {
      throw new UnauthorizedException("Refresh token is required");
    }
    return this.auth.logout(body.refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]?.toString(),
    });
  }

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(body.email, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]?.toString(),
    });
  }

  @Public()
  @Post("reset-password")
  resetPassword(@Body() body: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(body.token, body.password, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]?.toString(),
    });
  }

  @Post("change-password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.toString(),
      },
    );
  }
}
