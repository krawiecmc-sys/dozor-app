// Sekret bramki dostępu (TOTP) + skrót (hash) klucza nadrzędnego.
//
// UWAGA — to NIE jest ochrona danych poufnych. Appka to statyczny kod
// hostowany publicznie (GitHub Pages) — ten plik jest technicznie
// pobierany przez każdą przeglądarkę, która wchodzi na stronę, więc
// zdeterminowana osoba techniczna mogłaby go odczytać i policzyć kody.
// To filtr przed przypadkowymi ludźmi (link znaleziony/przekazany dalej
// bez Twojej wiedzy), nie zamek na materiały zakładowe — te i tak nie
// trafiają do appki niezależnie od tej bramki.
//
// Klucz nadrzędny (Twój, do zawsze-dostępu): granat-dozor-7828-wentyl
// — zapisz go sobie osobno (np. w menedżerze haseł), tu jest tylko jego
// skrót (hash), nie da się go odtworzyć z tego pliku wprost.

export const TOTP_SECRET_BASE32 = 'DDFEEAVOJAMFEUXY4PD3X4RD5WXK4DZ2';
export const MASTER_KEY_HASH_HEX =
  'fdd65da17222567331092d0d9af3bcdf21d57ef8c5c2cb72f7c9bd2d648c860b';
