import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
  ValidateNested,
  IsMongoId,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";

class ContactInfoDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() hours?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() instagramLink?: string;
  @IsOptional() @IsString() facebookLink?: string;
  @IsOptional() @IsString() twitterLink?: string;
  @IsOptional() @IsString() tiktokLink?: string;
  @IsOptional() @IsBoolean() showInstagram?: boolean;
  @IsOptional() @IsBoolean() showFacebook?: boolean;
  @IsOptional() @IsBoolean() showTwitter?: boolean;
  @IsOptional() @IsBoolean() showTiktok?: boolean;
}

class GeneralSettingsDto {
  @IsString() @IsNotEmpty() storeName: string;
  @IsString() @IsNotEmpty() tagline: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() aboutUs?: string;
  @IsOptional() @IsString() logo?: string;
  @IsOptional() @IsString() favicon?: string;
  @ValidateNested() @Type(() => ContactInfoDto) contactInfo: ContactInfoDto;
}

class LayoutSettingsDto {
  @IsOptional() @IsString() header?: string;
  @IsOptional() @IsString() allProducts?: string;
  @IsOptional() @IsBoolean() visibleFeaturedProducts?: boolean;
  @IsOptional() @IsBoolean() visibleProductCarausel?: boolean;
  @IsOptional() @IsBoolean() visibleAdvertismentBar?: boolean;
  @IsOptional() @IsString() advertiseText?: string;
  @IsOptional() @IsString() adBarBgcolor?: string;
  @IsOptional() @IsString() adBarTextColor?: string;
  @IsOptional() @IsString() adBarPosition?: string;
  @IsOptional() @IsBoolean() visibleQuickPicks?: boolean;
  @IsOptional() @IsString() featuredProducts?: string;
  @IsOptional() @IsString() quickPicks?: string;
  @IsOptional() @IsArray() quickPicksProducts?: string[];
  @IsOptional() @IsString() banner?: string;
  @IsOptional() @IsString() bannerTextAlign?: string;
  @IsOptional() @IsString() footer?: string;
  @IsOptional() @IsNumber() headerFontSize?: number;
  @IsOptional() @IsString() headerFontColor?: string;
  @IsOptional() @IsString() headerBgColor?: string;
  @IsOptional() @IsBoolean() headerBold?: boolean;
  @IsOptional() @IsString() headerNavPosition?: string;
  @IsOptional() @IsString() bannerType?: string;
  @IsOptional() @IsArray() bannerImages?: string[];
  @IsOptional() @IsNumber() bannerFontSize?: number;
  @IsOptional() @IsString() bannerFontColor?: string;
  @IsOptional() @IsBoolean() bannerBold?: boolean;
  @IsOptional() @IsString() productCardStyle?: string;
  @IsOptional() @IsArray() sectionOrder?: string[];
  @IsOptional() @IsBoolean() showHistoryBox?: boolean;
  @IsOptional() @IsString() historyContent?: string;
  @IsOptional() @IsBoolean() showInstagramBar?: boolean;
  @IsOptional() @IsArray() instagramReelUrls?: string[];
  @IsOptional() @IsBoolean() showVideoSection?: boolean;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsBoolean() showOurStory?: boolean;
  @IsOptional() @IsString() ourStoryTitle?: string;
  @IsOptional() @IsString() ourStoryDescription?: string;
  @IsOptional() @IsArray() ourStoryMedia?: { type: "image" | "video"; url: string; thumbnail?: string }[];
  @IsOptional() @IsString() featuredProductTitle?: string;
  @IsOptional() @IsString() featuredProductDescription?: string;
  @IsOptional() @IsString() ourProductsTitle?: string;
  @IsOptional() @IsString() ourProductsDescription?: string;
  @IsOptional() @IsString() ourStoryEyebrow?: string;
  @IsOptional() @IsString() quickPicksTitle?: string;
  @IsOptional() @IsString() quickPicksDescription?: string;
  @IsOptional() @IsString() allProductsTitle?: string;
  @IsOptional() @IsString() allProductsDescription?: string;
  @IsOptional() @IsString() instagramTitle?: string;
  @IsOptional() @IsString() instagramDescription?: string;
  @IsOptional() @IsString() videoSectionTitle?: string;
  @IsOptional() @IsString() videoSectionDescription?: string;
  @IsOptional() @IsString() newsletterTitle?: string;
  @IsOptional() @IsString() newsletterDescription?: string;
  @IsOptional() @IsString() featuredProductTitleColor?: string;
  @IsOptional() @IsString() featuredProductDescColor?: string;
  @IsOptional() @IsString() ourProductsTitleColor?: string;
  @IsOptional() @IsString() ourProductsDescColor?: string;
  @IsOptional() @IsString() quickPicksTitleColor?: string;
  @IsOptional() @IsString() quickPicksDescColor?: string;
  @IsOptional() @IsString() allProductsTitleColor?: string;
  @IsOptional() @IsString() allProductsDescColor?: string;
  @IsOptional() @IsString() instagramTitleColor?: string;
  @IsOptional() @IsString() instagramDescColor?: string;
  @IsOptional() @IsString() videoSectionTitleColor?: string;
  @IsOptional() @IsString() videoSectionDescColor?: string;
  @IsOptional() @IsString() newsletterTitleColor?: string;
  @IsOptional() @IsString() newsletterDescColor?: string;
  @IsOptional() @IsString() ourStoryEyebrowColor?: string;
  @IsOptional() @IsString() ourStoryTitleColor?: string;
  @IsOptional() @IsString() ourStoryDescColor?: string;
  @IsOptional() @IsBoolean() showFeedbackBar?: boolean;
  @IsOptional() @IsBoolean() showDarkMode?: boolean;
  @IsOptional() @IsNumber() sectionFontSize?: number;
  @IsOptional() @IsString() sectionFontColor?: string;
  @IsOptional() @IsBoolean() sectionBold?: boolean;
  @IsOptional() @IsNumber() cardNameFontSize?: number;
  @IsOptional() @IsString() cardNameColor?: string;
  @IsOptional() @IsString() cardPriceColor?: string;
  @IsOptional() @IsString() cardDescColor?: string;
  @IsOptional() @IsString() footerBgColor?: string;
  @IsOptional() @IsString() footerTextColor?: string;
  @IsOptional() @IsNumber() footerFontSize?: number;
}

class DesignSettingsDto {
  @IsString() theme: string;
  @IsString() primaryColor: string;
  @IsString() secondaryColor: string;
  @IsString() fontFamily: string;
  @IsObject()
  @ValidateNested()
  @Type(() => LayoutSettingsDto) // THIS IS CRUCIAL
  layout: LayoutSettingsDto;
  @IsOptional() @IsString() bannerImage?: string;
  @IsOptional() @IsString() heroBannerImage?: string;
  @IsBoolean() showBanner: boolean;
  @IsString() bannerHeight: string;
}

class FeaturesSettingsDto {
  @IsOptional() @IsBoolean() showSearch?: boolean;
  @IsOptional() @IsBoolean() showFilters?: boolean;
  @IsOptional() @IsBoolean() showReviews?: boolean;
  @IsOptional() @IsBoolean() showWishlist?: boolean;
  @IsOptional() @IsBoolean() showQuickView?: boolean;
  @IsOptional() @IsBoolean() showSocialMedia?: boolean;
  @IsOptional() @IsBoolean() enableChat?: boolean;
  @IsOptional() @IsBoolean() showNewsletter?: boolean;
}

class SeoSettingsDto {
  @IsString() @IsNotEmpty() metaTitle: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsString() keywords?: string;
  @IsOptional() @IsString() customCode?: string;
}

export class CreateShopkeeperStoreDto {
  @IsString()
  shopkeeperId: string;

  @IsString()
  slug: string;

  @IsObject()
  @ValidateNested()
  @Type(() => GeneralSettingsDto)
  general: GeneralSettingsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => DesignSettingsDto)
  design: DesignSettingsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => FeaturesSettingsDto)
  features: FeaturesSettingsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => SeoSettingsDto)
  seo: SeoSettingsDto;

  @IsOptional()
  @IsArray()
  feedbacks?: { name: string; rating: number; text: string; date: string }[];
}
