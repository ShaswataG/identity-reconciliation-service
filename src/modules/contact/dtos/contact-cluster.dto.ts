export interface ContactClusterDto {
  primary: number;
  emails: Set<string>;
  phoneNumbers: Set<string>;
  secondaries: number[];
}