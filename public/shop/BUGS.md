# Bug list (spoilers!)

These bugs are active only in bug mode (`?bugs=1` for all, or `?bugs=B03,B07` for specific ones).
Write tests against the business rules in the README first, then check which of these your tests catch.

| ID | Area | Bug | How to see it |
|---|---|---|---|
| B01 | Cart | The header cart badge doesn't update after removing an item on the cart page | Remove an item and compare the badge with the remaining quantity |
| B02 | Cart / checkout | Tax is calculated on the subtotal **before** the discount | 2 × USB-C Charger + `SAVE10`: tax should be $3.60, bug shows $4.00 |
| B03 | Cart / checkout | Free shipping requires subtotal **> $50** instead of **≥ $50** (boundary) | 2 × USB-C Charger ($50.00): shipping should be Free |
| B04 | Register | "Confirm password" isn't compared with the password | Enter different passwords; no error appears |
| B05 | Catalog | Price sorting compares prices as text | Sort by "Price: low to high": $110.00 comes before $12.00 |
| B06 | Catalog | Search is case-sensitive | Search `MUG`: nothing is found |
| B07 | Checkout | US ZIP code accepts 4 digits | Enter ZIP `1234`: no error appears |
| B08 | Catalog | The last page of the pagination is missing its final product | Page 4 is empty although the count says "Showing 25–25 of 25" |
| B09 | Auth | Logout doesn't clear the session | Log out, then open `orders.html`: you're still logged in |
| B10 | Product | Quantity can go above the available stock | Smart Watch (3 left): the stepper goes up to 10 and the cart accepts it |
| B11 | Admin | Editing a product rounds its price to whole dollars | Edit a product and save price 19.99: it becomes $20.00 |
| B12 | Login | Email comparison is case-sensitive | Log in as `Standard@shop.test`: "Invalid email or password." |
