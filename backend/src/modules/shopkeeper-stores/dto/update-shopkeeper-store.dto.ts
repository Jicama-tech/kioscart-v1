import { PartialType } from "@nestjs/mapped-types";
import { CreateShopkeeperStoreDto } from "./create-shopkeeper-store.dto";
import { IsOptional } from "class-validator";

export class UpdateShopkeeperStoreDto {
  @IsOptional()
  general?: {
    storeName?: string;
    tagline?: string;
    description?: string;
    aboutUs?: string;
    logo?: string;
    favicon?: string;
    contactInfo?: {
      phone?: string;
      email?: string;
      address?: string;
      hours?: string;
      website?: string;
      showInstagram?: boolean;
      showFacebook?: boolean;
      showTwitter?: boolean;
      showTiktok?: boolean;
      facebookLink?: string;
      twitterLink?: string;
      tiktokLink?: string;
      instagramLink?: string;
    };
  };

  @IsOptional()
  slug: string;

  @IsOptional()
  design?: {
    theme?: string;
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: string;
    layout?: {
      header?: string;
      visibleAdvertismentBar?: boolean;
      visibleProductCarausel?: boolean;
      advertiseText?: string;
      adBarBgcolor?: string;
      adBarTextColor?: string;
      adBarPosition?: string;
      allProducts?: string;
      visibleFeaturedProducts?: boolean;
      visibleQuickPicks?: boolean;
      featuredProducts?: string;
      quickPicks?: string;
      quickPicksProducts?: string[];
      banner?: string;
      footer?: string;
      headerFontSize?: number;
      headerFontColor?: string;
      headerBgColor?: string;
      headerBold?: boolean;
      headerNavPosition?: string;
      bannerType?: string;
      bannerImages?: string[];
      bannerFontSize?: number;
      bannerFontColor?: string;
      bannerBold?: boolean;
      productCardStyle?: string;
      sectionOrder?: string[];
      showHistoryBox?: boolean;
      historyContent?: string;
      showInstagramBar?: boolean;
      instagramReelUrls?: string[];
      showVideoSection?: boolean;
      videoUrl?: string;
      showOurStory?: boolean;
      ourStoryTitle?: string;
      ourStoryDescription?: string;
      ourStoryMedia?: { type: "image" | "video"; url: string; thumbnail?: string }[];
      featuredProductTitle?: string;
      featuredProductDescription?: string;
      ourProductsTitle?: string;
      ourProductsDescription?: string;
      ourStoryEyebrow?: string;
      quickPicksTitle?: string;
      quickPicksDescription?: string;
      allProductsTitle?: string;
      allProductsDescription?: string;
      instagramTitle?: string;
      instagramDescription?: string;
      videoSectionTitle?: string;
      videoSectionDescription?: string;
      newsletterTitle?: string;
      newsletterDescription?: string;
      featuredProductTitleColor?: string;
      featuredProductDescColor?: string;
      ourProductsTitleColor?: string;
      ourProductsDescColor?: string;
      quickPicksTitleColor?: string;
      quickPicksDescColor?: string;
      allProductsTitleColor?: string;
      allProductsDescColor?: string;
      instagramTitleColor?: string;
      instagramDescColor?: string;
      videoSectionTitleColor?: string;
      videoSectionDescColor?: string;
      newsletterTitleColor?: string;
      newsletterDescColor?: string;
      ourStoryEyebrowColor?: string;
      ourStoryTitleColor?: string;
      ourStoryDescColor?: string;
      showFeedbackBar?: boolean;
      showDarkMode?: boolean;
      sectionFontSize?: number;
      sectionFontColor?: string;
      sectionBold?: boolean;
      cardNameFontSize?: number;
      cardNameColor?: string;
      cardPriceColor?: string;
      cardDescColor?: string;
      footerBgColor?: string;
      footerTextColor?: string;
      footerFontSize?: number;
    };
    heroBannerImage?: string;
    bannerImage?: string;
    showBanner?: boolean;
    bannerHeight?: string;
  };

  @IsOptional()
  features?: {
    showSearch?: boolean;
    showFilters?: boolean;
    showReviews?: boolean;
    showWishlist?: boolean;
    showQuickView?: boolean;
    showSocialMedia?: boolean;
    enableChat?: boolean;
    showNewsletter?: boolean;
  };

  @IsOptional()
  feedbacks?: { name: string; rating: number; text: string; date: string }[];

  @IsOptional()
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
    customCode?: string;
  };
}
