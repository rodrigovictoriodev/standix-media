import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { AssetKind } from "@prisma/client";

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === "true" || value === "1";
const emptyToNull = ({ value }: { value: unknown }) =>
  value === "" ? null : value;

export class ListAssetsQuery {
  /** Folder id, or "root" for assets without a folder. */
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeSubfolders?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  trashed?: boolean;

  @IsOptional()
  @IsEnum(AssetKind)
  kind?: AssetKind;
}

export class UploadAssetBody {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  folderId?: string | null;

  /** Comma separated list, as sent by multipart forms. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  tags?: string;
}

export class UpdateAssetBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  folderId?: string | null;
}

export class SetAssetTagsBody {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags!: string[];
}

export class CreateFolderBody {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parentId?: string | null;
}

export class UpdateFolderBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parentId?: string | null;
}
