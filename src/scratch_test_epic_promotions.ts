import axios from "axios";

async function testEpicPromotions() {
  try {
    const url = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=ko-KR&country=KR&allowCountries=KR";
    const res = await axios.get(url, { timeout: 8000 });
    const elements = res.data?.data?.Catalog?.searchStore?.elements || [];
    console.log("Total Elements:", elements.length);
    
    const discounted = elements.filter((el: any) => {
      const original = el.price?.totalPrice?.originalPrice || 0;
      const discount = el.price?.totalPrice?.discountPrice || 0;
      return original > 0 && discount < original;
    });

    console.log("Discounted Elements count:", discounted.length);
    if (discounted.length > 0) {
      console.log("Sample Discounted Item:");
      const item = discounted[0];
      console.log({
        title: item.title,
        originalPrice: item.price.totalPrice.originalPrice,
        discountPrice: item.price.totalPrice.discountPrice,
        discountPercent: Math.round(((item.price.totalPrice.originalPrice - item.price.totalPrice.discountPrice) / item.price.totalPrice.originalPrice) * 100),
        productSlug: item.productSlug || item.urlSlug || (item.catalogNs?.mappings?.[0]?.pageSlug)
      });
    }
  } catch (e: any) {
    console.error("Failed to query Epic Promotions:", e.message);
  }
}

testEpicPromotions();
