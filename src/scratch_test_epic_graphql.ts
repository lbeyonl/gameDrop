import axios from "axios";

async function testEpicGraphql() {
  try {
    const url = "https://store.epicgames.com/graphql";
    const query = `
      query searchStoreQuery($allowCountries: String, $category: String, $country: String!, $locale: String, $sortBy: String, $sortDir: String, $start: Int, $count: Int, $onSale: Boolean) {
        Catalog {
          searchStore(
            allowCountries: $allowCountries,
            category: $category,
            country: $country,
            locale: $locale,
            sortBy: $sortBy,
            sortDir: $sortDir,
            start: $start,
            count: $count,
            onSale: $onSale
          ) {
            elements {
              title
              productSlug
              urlSlug
              catalogNs {
                mappings {
                  pageSlug
                  pageType
                }
              }
              price {
                totalPrice {
                  discountPrice
                  originalPrice
                  discount
                  currencyCode
                }
              }
              keyImages {
                type
                url
              }
            }
          }
        }
      }
    `;

    const variables = {
      country: "KR",
      locale: "ko",
      allowCountries: "KR",
      start: 0,
      count: 30,
      onSale: true,
      sortBy: "releaseDate",
      sortDir: "DESC"
    };

    const res = await axios.post(url, { query, variables }, {
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 8000
    });
    const elements = res.data?.data?.Catalog?.searchStore?.elements || [];
    console.log("Success! Items count:", elements.length);
    if (elements.length > 0) {
      console.log("Sample Item:");
      console.log(JSON.stringify(elements[0], null, 2));
    }
  } catch (e: any) {
    console.error("Epic GraphQL fetch failed:", e.message);
  }
}

testEpicGraphql();
